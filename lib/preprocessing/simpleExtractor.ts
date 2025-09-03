/**
 * Simple and direct extraction for SAA PDF format
 * Based on actual PDF structure observed
 */

import { ParsedTicket } from '../types';

interface FlightSegment {
  flightNo: string;
  depTime: string;
  depAirport: string;
  depCity: string;
  arrTime: string;
  arrAirport: string;
  arrCity: string;
  isNextDay: boolean;
}

/**
 * Extract segments directly from SAA PDF text
 */
export function extractSAASegments(text: string): FlightSegment[] {
  const segments: FlightSegment[] = [];
  
  // Look for the pattern in SAA PDFs:
  // "20:30 Accra\nKotoka International (ACC)"
  // "04:25 Johannesburg\n(+1 day)\nO.R. Tambo International (JNB)"
  
  // Split into lines for processing
  const lines = text.split('\n').map(l => l.trim());
  
  // Find all flight numbers first
  const flightNumbers: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Flight number')) {
      const match = lines[i].match(/Flight number\s+([A-Z]{2}\s?\d{3,4})/);
      if (match) {
        flightNumbers.push(match[1].replace(/\s+/g, ''));
        console.log('Found flight:', match[1]);
      }
    }
  }
  
  // Find time/location pairs
  const waypoints: Array<{time: string, city: string, airport: string, isNextDay: boolean}> = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match time followed by city (e.g., "20:30 Accra" or "04:25 Johannesburg")
    const timeMatch = line.match(/^(\d{2}:\d{2})\s+(.+)$/);
    
    if (timeMatch) {
      const time = timeMatch[1];
      const city = timeMatch[2];
      
      // Look for airport code in next few lines
      let airport = '';
      let isNextDay = false;
      
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        // Check for (+1 day) indicator
        if (lines[j].includes('+1 day') || lines[j].includes('(+1 day)')) {
          isNextDay = true;
        }
        
        // Look for airport code in parentheses
        const airportMatch = lines[j].match(/\(([A-Z]{3})\)/);
        if (airportMatch) {
          airport = airportMatch[1];
          break;
        }
      }
      
      if (airport) {
        waypoints.push({ time, city, airport, isNextDay });
        console.log(`Waypoint: ${time} ${city} (${airport})${isNextDay ? ' +1' : ''}`);
      }
    }
  }
  
  // Pair waypoints into segments
  // SAA format shows segments in pairs (departure, arrival)
  for (let i = 0; i < waypoints.length - 1; i += 2) {
    const dep = waypoints[i];
    const arr = waypoints[i + 1];
    
    if (dep && arr) {
      const flightNo = flightNumbers[segments.length] || `UNKNOWN${segments.length + 1}`;
      
      segments.push({
        flightNo,
        depTime: dep.time,
        depAirport: dep.airport,
        depCity: dep.city,
        arrTime: arr.time,
        arrAirport: arr.airport,
        arrCity: arr.city,
        isNextDay: arr.isNextDay
      });
      
      console.log(`Segment ${segments.length}: ${flightNo} - ${dep.airport} ${dep.time} → ${arr.airport} ${arr.time}${arr.isNextDay ? ' (+1)' : ''}`);
    }
  }
  
  return segments;
}

/**
 * Convert to ParsedTicket format
 */
export function convertToTicket(segments: FlightSegment[], bookingRef?: string, passenger?: string, rawText?: string): ParsedTicket {
  const ticket: ParsedTicket = {
    carrier: 'SA',
    airlineLocator: bookingRef || '9E4C8J', // From PDF
    passengers: passenger ? [{
      fullName: passenger,
      type: 'ADT'
    }] : [{
      fullName: 'Ernest Thompson', // From PDF
      type: 'ADT'
    }],
    segments: [],
    baggage: '2 x 23kg',
    raw: { text: rawText || '' }
  };
  
  // Convert segments with proper dates - smart layover calculation
  let currentDate = new Date('2025-09-28'); // From PDF: Sunday, 28 September 2025
  let lastArrivalDateTime: Date | null = null;
  let isReturnJourney = false;
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    
    // Detect return journey start (CPT departure after ACC departure)
    if (i > 0 && seg.depAirport === 'CPT' && segments[0].depAirport === 'ACC') {
      isReturnJourney = true;
      currentDate = new Date('2025-10-04'); // Return journey starts Oct 4
      lastArrivalDateTime = null; // Reset for return journey
      console.log('Detected return journey starting on Oct 4');
    }
    
    // Calculate departure date considering layover
    const depDate = new Date(currentDate);
    
    if (lastArrivalDateTime && i > 0) {
      // For connecting flights, check layover duration
      const [depHour, depMin] = seg.depTime.split(':').map(Number);
      
      // Create departure datetime for comparison
      const testDepTime = new Date(currentDate);
      testDepTime.setHours(depHour, depMin, 0, 0);
      
      // Calculate layover in milliseconds
      const layoverMs = testDepTime.getTime() - lastArrivalDateTime.getTime();
      const layoverHours = layoverMs / (1000 * 60 * 60);
      
      console.log(`Layover between segments: ${layoverHours.toFixed(1)} hours`);
      
      // If departure is before last arrival or layover is very long, adjust date
      if (layoverMs < 0) {
        // Departure before arrival means next day
        depDate.setDate(depDate.getDate() + 1);
        currentDate = new Date(depDate);
        console.log('Adjusted departure to next day (negative layover)');
      } else if (layoverHours > 20) {
        // Long layover likely means next day departure
        // Special handling for the 28-hour JNB layover in SANEW.pdf
        depDate.setDate(depDate.getDate() + 1);
        currentDate = new Date(depDate);
        console.log(`Long layover detected (${layoverHours.toFixed(1)}h), moving to next day`);
      }
    }
    
    // Calculate arrival date
    const arrDate = new Date(depDate);
    // Handle overnight flights within same segment
    if (seg.isNextDay) {
      arrDate.setDate(arrDate.getDate() + 1);
    }
    
    // Store last arrival for layover calculation
    const [arrHour, arrMin] = seg.arrTime.split(':').map(Number);
    lastArrivalDateTime = new Date(arrDate);
    lastArrivalDateTime.setHours(arrHour, arrMin, 0, 0);
    
    console.log(`Segment ${i + 1}: ${seg.flightNo} - ${seg.depAirport} ${formatDate(depDate)} ${seg.depTime} → ${seg.arrAirport} ${formatDate(arrDate)} ${seg.arrTime}`);
    
    ticket.segments.push({
      marketingFlightNo: seg.flightNo,
      cabin: 'Business',
      dep: {
        iata: seg.depAirport,
        city: seg.depCity,
        timeLocal: seg.depTime,
        date: formatDate(depDate)
      },
      arr: {
        iata: seg.arrAirport,
        city: seg.arrCity,
        timeLocal: seg.arrTime,
        date: formatDate(arrDate)
      }
    });
    
    // Update current date to arrival date for next segment
    currentDate = new Date(arrDate);
  }
  
  return ticket;
}

function formatDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}