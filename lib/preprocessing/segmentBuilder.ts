/**
 * Segment builder that stitches waypoints into flight segments
 * Uses deterministic logic to reduce reliance on LLM
 */

import { Waypoint } from './textCleaner';
import { ParsedTicket } from '../types';

export interface FlightLeg {
  flightNumber?: string;
  departure: {
    time: string;
    location: string;
    date?: string;
    terminal?: string;
    isNextDay?: boolean;
  };
  arrival: {
    time: string;
    location: string;
    date?: string;
    terminal?: string;
    isNextDay?: boolean;
  };
  duration?: string;
}

/**
 * Stitch waypoints into flight legs
 * Pairs consecutive waypoints as departure/arrival
 */
export function stitchWaypointsIntoLegs(
  waypoints: Waypoint[],
  flightNumbers: string[],
  durations: Map<string, string>
): FlightLeg[] {
  const legs: FlightLeg[] = [];
  
  // Validate we have even number of waypoints
  if (waypoints.length % 2 !== 0) {
    console.warn(`Odd number of waypoints (${waypoints.length}), may have parsing issues`);
  }
  
  // Pair waypoints into legs (0→1, 2→3, etc.)
  for (let i = 0; i + 1 < waypoints.length; i += 2) {
    const dep = waypoints[i];
    const arr = waypoints[i + 1];
    
    const leg: FlightLeg = {
      departure: {
        time: dep.time,
        location: dep.location,
        terminal: dep.terminal,
        isNextDay: dep.isNextDay
      },
      arrival: {
        time: arr.time,
        location: arr.location,
        terminal: arr.terminal,
        isNextDay: arr.isNextDay
      }
    };
    
    // Attach flight number if available
    const legIndex = Math.floor(i / 2);
    if (legIndex < flightNumbers.length) {
      leg.flightNumber = flightNumbers[legIndex];
      
      // Attach duration if available
      const duration = durations.get(leg.flightNumber);
      if (duration) {
        leg.duration = duration;
      }
    }
    
    legs.push(leg);
    
    console.log(`Created leg ${legIndex + 1}: ${dep.time} ${dep.location} → ${arr.time} ${arr.location}${arr.isNextDay ? ' (+1)' : ''}`);
  }
  
  return legs;
}

/**
 * Convert legs to ParsedTicket segments format
 */
export function convertLegsToParsedSegments(
  legs: FlightLeg[],
  baseDate: string // Starting date for the journey
): ParsedTicket['segments'] {
  const segments: ParsedTicket['segments'] = [];
  let currentDate = new Date(baseDate);
  
  for (const leg of legs) {
    // Calculate dates based on isNextDay flags
    const depDate = new Date(currentDate);
    const arrDate = new Date(currentDate);
    
    // If arrival is next day, increment date
    if (leg.arrival.isNextDay) {
      arrDate.setDate(arrDate.getDate() + 1);
    }
    
    // If departure is also marked as next day (for subsequent legs)
    if (leg.departure.isNextDay) {
      depDate.setDate(depDate.getDate() + 1);
      arrDate.setDate(arrDate.getDate() + 1);
    }
    
    const segment = {
      marketingFlightNo: leg.flightNumber || '',
      dep: {
        iata: leg.departure.location,
        city: getCityName(leg.departure.location),
        terminal: leg.departure.terminal,
        timeLocal: leg.departure.time,
        date: formatDate(depDate)
      },
      arr: {
        iata: leg.arrival.location,
        city: getCityName(leg.arrival.location),
        terminal: leg.arrival.terminal,
        timeLocal: leg.arrival.time,
        date: formatDate(arrDate)
      }
    };
    
    segments.push(segment);
    
    // Update current date for next segment
    currentDate = arrDate;
  }
  
  return segments;
}

/**
 * Format date as DD MMM YYYY
 */
function formatDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Get city name from IATA code
 */
function getCityName(iata: string): string {
  const cityMap: Record<string, string> = {
    'ACC': 'Accra',
    'JNB': 'Johannesburg',
    'CPT': 'Cape Town',
    'LHR': 'London',
    'CDG': 'Paris',
    'FRA': 'Frankfurt',
    'AMS': 'Amsterdam',
    'DXB': 'Dubai',
    'JFK': 'New York',
    'LAX': 'Los Angeles',
    'LOS': 'Lagos',
    'ABV': 'Abuja'
  };
  
  return cityMap[iata] || iata;
}

/**
 * Validate segment consistency
 */
export function validateSegments(segments: ParsedTicket['segments']): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    
    // Check required fields
    if (!segment.marketingFlightNo) {
      errors.push(`Segment ${i + 1}: Missing flight number`);
    }
    
    if (!segment.dep.iata || !segment.arr.iata) {
      errors.push(`Segment ${i + 1}: Missing airport codes`);
    }
    
    if (!segment.dep.timeLocal || !segment.arr.timeLocal) {
      errors.push(`Segment ${i + 1}: Missing times`);
    }
    
    // Check chronological consistency for multi-segment
    if (i > 0) {
      const prevSegment = segments[i - 1];
      const prevArrTime = new Date(`${prevSegment.arr.date} ${prevSegment.arr.timeLocal}`);
      const currDepTime = new Date(`${segment.dep.date} ${segment.dep.timeLocal}`);
      
      if (currDepTime < prevArrTime) {
        errors.push(`Segment ${i + 1}: Departure before previous arrival`);
      }
      
      // Check for unrealistic connections (less than 30 min)
      const layoverMs = currDepTime.getTime() - prevArrTime.getTime();
      const layoverMins = layoverMs / (1000 * 60);
      if (layoverMins < 30) {
        errors.push(`Segment ${i + 1}: Layover too short (${Math.round(layoverMins)} mins)`);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Main function to build segments from preprocessed text
 */
export function buildSegmentsFromText(
  cleanedText: string,
  cityIataMap: Map<string, string>,
  waypoints: Waypoint[],
  flightNumbers: string[],
  durations: Map<string, string>,
  baseDate: string
): ParsedTicket['segments'] {
  // Stitch waypoints into legs
  const legs = stitchWaypointsIntoLegs(waypoints, flightNumbers, durations);
  
  // Convert to ParsedTicket format
  const segments = convertLegsToParsedSegments(legs, baseDate);
  
  // Validate
  const validation = validateSegments(segments);
  if (!validation.isValid) {
    console.warn('Segment validation issues:', validation.errors);
  }
  
  return segments;
}