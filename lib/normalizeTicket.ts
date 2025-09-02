import { ParsedTicket, PAX_TYPE_MAP } from './types';
import { inferSegmentDates, validateSegmentDates } from './utils/dateInference';

export interface NormalizedItinerary {
  passengers: Array<{
    name: string;
    type: "adult" | "child" | "infant";
  }>;
  segments: Array<{
    airline: string;
    flightNumber: string;
    aircraft?: string;
    departure: {
      airport: string;
      code: string;
      scheduledTime: string;
      actualTime?: string;
      terminal?: string;
      gate?: string;
    };
    arrival: {
      airport: string;
      code: string;
      scheduledTime: string;
      actualTime?: string;
      terminal?: string;
      gate?: string;
    };
    status: string;
    duration?: string;
    codeshares?: string[];
    cabin?: string;
    bookingClass?: string;
  }>;
  createdAt: string;
  bookingExtras?: {
    airlineLocator?: string;
    iataNumber?: string;
    ticketNumbers?: Array<{
      number: string;
      passengerName: string;
      validUntil?: string;
    }>;
    baggage?: string;
    handBaggage?: string;
    mealService?: Array<{
      segmentIndex: number;
      service: string;
    }>;
    payments?: Array<{
      currency: string;
      amount: number;
      method?: string;
    }>;
    fareDetails?: {
      baseFare?: number;
      currency?: string;
      carrierCharges?: number;
      taxes?: Array<{
        type: string;
        amount: number;
        description?: string;
      }>;
      total?: number;
    };
    fareNotes?: string;
    extractedFrom?: string;
    parsedWith?: string;
    extractedAt?: string;
  };
}

export interface NormalizationOptions {
  extractedFrom?: 'file' | 'pasted_html';
  parsedWith?: string;
  preserveExistingData?: boolean;
}

export function normalizeTicketToItinerary(
  parsedTicket: ParsedTicket, 
  options: NormalizationOptions = {}
): NormalizedItinerary {
  
  // Apply conservative date inference logic only for missing dates
  const inferredSegments = inferSegmentDates(parsedTicket.segments);
  
  // Validate the date logic but don't fail the process
  const validation = validateSegmentDates(inferredSegments);
  if (!validation.isValid) {
    console.warn('Date validation found potential issues:', validation.errors);
  }
  
  const normalizedItinerary: NormalizedItinerary = {
    passengers: normalizePassengers(parsedTicket.passengers),
    segments: normalizeSegments(inferredSegments, parsedTicket.carrier),
    createdAt: new Date().toISOString(),
  };

  // Add booking extras if we have additional data
  const bookingExtras: any = {};

  if (parsedTicket.airlineLocator) {
    bookingExtras.airlineLocator = parsedTicket.airlineLocator;
  }

  if (parsedTicket.iataNumber) {
    bookingExtras.iataNumber = parsedTicket.iataNumber;
  }

  if (parsedTicket.tickets && parsedTicket.tickets.length > 0) {
    bookingExtras.ticketNumbers = parsedTicket.tickets.map(ticket => ({
      number: ticket.number,
      passengerName: ticket.paxName || '',
      validUntil: ticket.validUntil
    }));
  }

  if (parsedTicket.baggage) {
    bookingExtras.baggage = normalizeBaggage(parsedTicket.baggage);
  }

  if (parsedTicket.handBaggage) {
    bookingExtras.handBaggage = parsedTicket.handBaggage;
  }

  // Extract meal service from segments
  const mealServices = extractMealServices(parsedTicket.segments);
  if (mealServices.length > 0) {
    bookingExtras.mealService = mealServices;
  }

  if (parsedTicket.payments && parsedTicket.payments.length > 0) {
    bookingExtras.payments = parsedTicket.payments.map(payment => ({
      currency: payment.currency,
      amount: payment.total,
      method: payment.method
    }));
  }

  if (parsedTicket.fareDetails) {
    bookingExtras.fareDetails = parsedTicket.fareDetails;
  }

  if (parsedTicket.fareNotes) {
    bookingExtras.fareNotes = parsedTicket.fareNotes;
  }

  // Add metadata about extraction
  if (options.extractedFrom) {
    bookingExtras.extractedFrom = options.extractedFrom;
  }

  if (options.parsedWith) {
    bookingExtras.parsedWith = options.parsedWith;
  }

  bookingExtras.extractedAt = new Date().toISOString();

  // Only add bookingExtras if we have some data
  if (Object.keys(bookingExtras).length > 0) {
    normalizedItinerary.bookingExtras = bookingExtras;
  }

  return normalizedItinerary;
}

function normalizePassengers(passengers: ParsedTicket['passengers']): NormalizedItinerary['passengers'] {
  return passengers.map(passenger => ({
    name: passenger.fullName.trim(),
    type: normalizePassengerType(passenger.type)
  }));
}

function normalizePassengerType(type?: "ADT"|"CHD"|"INF"): "adult" | "child" | "infant" {
  if (!type) return "adult";
  
  const mapped = PAX_TYPE_MAP[type];
  return mapped || "adult";
}

function normalizeSegments(
  segments: ParsedTicket['segments'], 
  defaultCarrier?: string
): NormalizedItinerary['segments'] {
  return segments.map(segment => {
    // Extract airline code from flight number or use default
    const flightMatch = segment.marketingFlightNo.match(/^([A-Z]{2,3})(\d+)$/);
    const airlineCode = flightMatch ? flightMatch[1] : defaultCarrier || 'XX';
    
    return {
      airline: airlineCode,
      flightNumber: segment.marketingFlightNo,
      departure: {
        airport: segment.dep.city || segment.dep.iata || 'Unknown',
        code: segment.dep.iata || extractCodeFromCity(segment.dep.city) || 'XXX',
        scheduledTime: formatDateTime(segment.dep.date, segment.dep.timeLocal),
        terminal: segment.dep.terminal
      },
      arrival: {
        airport: segment.arr.city || segment.arr.iata || 'Unknown',
        code: segment.arr.iata || extractCodeFromCity(segment.arr.city) || 'XXX',
        scheduledTime: formatDateTime(segment.arr.date, segment.arr.timeLocal),
        terminal: segment.arr.terminal
      },
      status: 'Confirmed', // Default status for e-ticket imported segments
      cabin: segment.cabin,
      bookingClass: segment.bookingClass
    };
  });
}

function formatDateTime(date?: string, time?: string): string {
  if (!date && !time) {
    return new Date().toISOString();
  }

  try {
    if (date && time) {
      const dateStr = parseDate(date);
      const timeStr = parseTime(time);
      
      if (dateStr && timeStr) {
        // For military time (HHMM), convert to HH:MM for ISO format
        let formattedTime = timeStr;
        if (/^\d{4}$/.test(timeStr)) {
          formattedTime = `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;
        }
        return `${dateStr}T${formattedTime}:00.000Z`;
      }
    }
    
    if (date) {
      const dateStr = parseDate(date);
      if (dateStr) {
        return `${dateStr}T00:00:00.000Z`;
      }
    }
    
    if (time) {
      const today = new Date().toISOString().split('T')[0];
      const timeStr = parseTime(time);
      if (timeStr) {
        // For military time (HHMM), convert to HH:MM for ISO format
        let formattedTime = timeStr;
        if (/^\d{4}$/.test(timeStr)) {
          formattedTime = `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;
        }
        return `${today}T${formattedTime}:00.000Z`;
      }
    }
  } catch (error) {
    console.warn('Failed to parse date/time:', { date, time }, error);
  }

  return new Date().toISOString();
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  const cleanDate = dateStr.trim();
  
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    return cleanDate;
  }
  
  // Try DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = cleanDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, part1, part2, year] = slashMatch;
    // Assume DD/MM/YYYY (European format)
    const day = part1.padStart(2, '0');
    const month = part2.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Try "DD MMM YYYY" format (common in airline tickets)
  const monthNames = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
    'january': '01', 'february': '02', 'march': '03', 'april': '04',
    'june': '06', 'july': '07', 'august': '08',
    'september': '09', 'october': '10', 'november': '11', 'december': '12'
  };
  
  // More flexible month matching
  const monthMatch = cleanDate.match(/^(\d{1,2})\s+(\w{3,9})\s+(\d{4})$/i);
  if (monthMatch) {
    const [, day, monthName, year] = monthMatch;
    const monthNum = monthNames[monthName.toLowerCase() as keyof typeof monthNames];
    if (monthNum) {
      return `${year}-${monthNum}-${day.padStart(2, '0')}`;
    }
  }
  
  // Try "MMM DD, YYYY" format (US style)
  const usStyleMatch = cleanDate.match(/^(\w{3,9})\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (usStyleMatch) {
    const [, monthName, day, year] = usStyleMatch;
    const monthNum = monthNames[monthName.toLowerCase() as keyof typeof monthNames];
    if (monthNum) {
      return `${year}-${monthNum}-${day.padStart(2, '0')}`;
    }
  }
  
  // Fallback: try to parse as Date and format
  try {
    const parsed = new Date(cleanDate);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  } catch (error) {
    // Silent fallback
  }
  
  return null;
}

function parseTime(timeStr: string): string | null {
  if (!timeStr) return null;
  
  const cleanTime = timeStr.trim();
  
  // IMPORTANT: Preserve military time format (HHMM) without colons if that's how it was extracted
  if (/^\d{4}$/.test(cleanTime)) {
    const hours = parseInt(cleanTime.substring(0, 2), 10);
    const minutes = parseInt(cleanTime.substring(2, 4), 10);
    
    // Validate it's a valid time
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return cleanTime; // Keep as HHMM
    }
  }
  
  // Handle 24-hour format with colon
  if (/^\d{1,2}:\d{2}$/.test(cleanTime)) {
    const [hours, minutes] = cleanTime.split(':');
    return `${hours.padStart(2, '0')}:${minutes}`;
  }
  
  // Handle 12-hour format with space
  const ampmMatch = cleanTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    const [, hoursStr, minutes, period] = ampmMatch;
    let hours = parseInt(hoursStr, 10);
    
    if (period.toUpperCase() === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period.toUpperCase() === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return `${hours.toString().padStart(2, '0')}${minutes}`;
  }
  
  // Handle 12-hour format without space (e.g., "10:30PM")
  const ampmNoSpaceMatch = cleanTime.match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (ampmNoSpaceMatch) {
    const [, hoursStr, minutes, period] = ampmNoSpaceMatch;
    let hours = parseInt(hoursStr, 10);
    
    if (period.toUpperCase() === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period.toUpperCase() === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return `${hours.toString().padStart(2, '0')}${minutes}`;
  }
  
  // Handle time with only hours (e.g., "14" -> "1400")
  const hoursOnlyMatch = cleanTime.match(/^\d{1,2}$/);
  if (hoursOnlyMatch) {
    const hours = parseInt(cleanTime, 10);
    if (hours >= 0 && hours <= 23) {
      return `${hours.toString().padStart(2, '0')}00`;
    }
  }
  
  return null;
}

function extractCodeFromCity(city?: string): string | null {
  if (!city) return null;
  
  // Simple airport code extraction from city names
  const airportMap: Record<string, string> = {
    'london': 'LHR',
    'heathrow': 'LHR',
    'gatwick': 'LGW',
    'paris': 'CDG',
    'amsterdam': 'AMS',
    'frankfurt': 'FRA',
    'dubai': 'DXB',
    'new york': 'JFK',
    'los angeles': 'LAX',
    'accra': 'ACC',
    'lagos': 'LOS',
    'abuja': 'ABV'
  };
  
  const cityLower = city.toLowerCase();
  for (const [cityName, code] of Object.entries(airportMap)) {
    if (cityLower.includes(cityName)) {
      return code;
    }
  }
  
  return null;
}

// Helper function to merge parsed data with existing itinerary data
export function mergeWithExistingItinerary(
  existing: Partial<NormalizedItinerary>,
  parsed: NormalizedItinerary,
  options: { preserveExisting?: boolean } = {}
): NormalizedItinerary {
  
  if (options.preserveExisting && existing.passengers?.length) {
    // Keep existing passengers, only add new ones if not already present
    const existingNames = existing.passengers.map(p => p.name.toLowerCase());
    const newPassengers = parsed.passengers.filter(p => 
      !existingNames.includes(p.name.toLowerCase())
    );
    parsed.passengers = [...existing.passengers, ...newPassengers];
  }
  
  if (options.preserveExisting && existing.segments?.length) {
    // Keep existing segments, add new ones
    parsed.segments = [...existing.segments, ...parsed.segments];
  }
  
  // Merge booking extras
  if (existing.bookingExtras && parsed.bookingExtras) {
    parsed.bookingExtras = {
      ...existing.bookingExtras,
      ...parsed.bookingExtras
    };
  } else if (existing.bookingExtras) {
    parsed.bookingExtras = existing.bookingExtras;
  }
  
  return parsed;
}

/**
 * Normalize baggage allowance to a consistent format
 */
function normalizeBaggage(baggage: string): string {
  // Convert "2 bags at 23kg" to "2 × 23kg"
  const bagsAtKgMatch = baggage.match(/(\d+)\s+bags?\s+at\s+(\d+)kg/i);
  if (bagsAtKgMatch) {
    const [, count, weight] = bagsAtKgMatch;
    return `${count} × ${weight}kg checked`;
  }

  // Convert "2 x 23kg" to "2 × 23kg checked"
  const xFormatMatch = baggage.match(/(\d+)\s*[x×]\s*(\d+)kg/i);
  if (xFormatMatch) {
    const [, count, weight] = xFormatMatch;
    if (!baggage.toLowerCase().includes('checked')) {
      return `${count} × ${weight}kg checked`;
    }
  }

  return baggage;
}

/**
 * Extract meal service information from segments
 */
function extractMealServices(segments: ParsedTicket['segments']): Array<{ segmentIndex: number; service: string }> {
  const mealServices: Array<{ segmentIndex: number; service: string }> = [];
  
  segments.forEach((segment, index) => {
    if ((segment as any).mealService) {
      mealServices.push({
        segmentIndex: index,
        service: (segment as any).mealService
      });
    }
  });

  return mealServices;
}