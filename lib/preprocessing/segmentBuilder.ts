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
 * Convert legs to ParsedTicket segments format with layover-aware date handling
 */
export function convertLegsToParsedSegments(
  legs: FlightLeg[],
  baseDate: string // Starting date for the journey
): ParsedTicket['segments'] {
  const segments: ParsedTicket['segments'] = [];
  let currentDate = new Date(baseDate);
  let lastArrivalDateTime: Date | null = null;
  
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    
    // Calculate departure date considering layover from previous segment
    const depDate = new Date(currentDate);
    
    if (lastArrivalDateTime && i > 0) {
      // For connecting flights, check layover duration
      const [depHour, depMin] = leg.departure.time.split(':').map(Number);
      
      // Create departure datetime for comparison
      const testDepTime = new Date(currentDate);
      testDepTime.setHours(depHour, depMin, 0, 0);
      
      // Calculate layover in milliseconds
      const layoverMs = testDepTime.getTime() - lastArrivalDateTime.getTime();
      const layoverHours = layoverMs / (1000 * 60 * 60);
      
      console.log(`Segment ${i}: Layover ${layoverHours.toFixed(1)} hours`);
      
      // If departure is before last arrival or layover exceeds 20 hours, adjust date
      if (layoverMs < 0) {
        // Departure before arrival means next day
        depDate.setDate(depDate.getDate() + 1);
        currentDate = new Date(depDate);
        console.log('Adjusted departure to next day (negative layover)');
      } else if (layoverHours > 20) {
        // Long layover likely means next day departure
        depDate.setDate(depDate.getDate() + 1);
        currentDate = new Date(depDate);
        console.log(`Long layover detected (${layoverHours.toFixed(1)}h), moving to next day`);
      }
    }
    
    // If departure is explicitly marked as next day
    if (leg.departure.isNextDay) {
      depDate.setDate(depDate.getDate() + 1);
      currentDate = new Date(depDate);
    }
    
    // Calculate arrival date
    const arrDate = new Date(depDate);
    
    // If arrival is next day, increment date
    if (leg.arrival.isNextDay) {
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
    
    // Store last arrival for layover calculation
    const [arrHour, arrMin] = leg.arrival.time.split(':').map(Number);
    lastArrivalDateTime = new Date(arrDate);
    lastArrivalDateTime.setHours(arrHour, arrMin, 0, 0);
    
    segments.push(segment);
    
    // Update current date to arrival date for next segment
    currentDate = new Date(arrDate);
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
  
  // Additional validation for chronological order and realistic layovers
  for (let i = 1; i < segments.length; i++) {
    const prevSegment = segments[i - 1];
    const currSegment = segments[i];
    
    try {
      const prevArrTime = new Date(`${prevSegment.arr.date} ${prevSegment.arr.timeLocal}`);
      const currDepTime = new Date(`${currSegment.dep.date} ${currSegment.dep.timeLocal}`);
      
      if (prevArrTime.getTime() > currDepTime.getTime()) {
        errors.push(`Segment ${i + 1}: Departure (${currSegment.dep.date} ${currSegment.dep.timeLocal}) before previous arrival (${prevSegment.arr.date} ${prevSegment.arr.timeLocal})`);
      }
      
      // Check for realistic layover duration
      const layoverMs = currDepTime.getTime() - prevArrTime.getTime();
      const layoverHours = layoverMs / (1000 * 60 * 60);
      
      if (layoverHours < 0.5) {
        errors.push(`Segment ${i + 1}: Unrealistically short layover (${layoverHours.toFixed(1)} hours)`);
      } else if (layoverHours > 48) {
        errors.push(`Segment ${i + 1}: Unusually long layover (${layoverHours.toFixed(1)} hours) - verify dates`);
      }
      
    } catch (dateError) {
      errors.push(`Segment ${i + 1}: Invalid date/time format for chronological validation`);
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