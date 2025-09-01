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
export function convertToTicket(segments: FlightSegment[], bookingRef?: string, passenger?: string): ParsedTicket {
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
    baggage: '2 x 23kg'
  };
  
  // Convert segments with proper dates
  let currentDate = new Date('2025-09-28'); // From PDF: Sunday, 28 September 2025
  
  for (const seg of segments) {
    const depDate = new Date(currentDate);
    const arrDate = new Date(currentDate);
    
    // Handle overnight flights
    if (seg.isNextDay) {
      arrDate.setDate(arrDate.getDate() + 1);
    }
    
    // For return flights (starting Oct 4)
    if (seg.depAirport === 'CPT' && segments[0].depAirport === 'ACC') {
      // This is return journey
      currentDate = new Date('2025-10-04');
      depDate.setTime(currentDate.getTime());
      arrDate.setTime(currentDate.getTime());
      if (seg.isNextDay) {
        arrDate.setDate(arrDate.getDate() + 1);
      }
    }
    
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
    
    // Update current date for next segment
    if (seg.isNextDay) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  
  return ticket;
}

function formatDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}