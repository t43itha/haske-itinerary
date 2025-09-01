import { ParsedTicket, BA_CABIN_MAP, PAX_TYPE_MAP } from '../types';
import { ParseInput } from './index';
import { extractTicket } from '../llm/extractTicket';
import { recordTokenUsage, generateExtractionId } from '../llm/tokenTracking';
import { isGroqConfigured } from '../llm/client';

export function looksLikeBA(input: ParseInput): boolean {
  const text = input.text || '';
  const html = input.html || '';
  const content = (text + ' ' + html).toLowerCase();
  
  return content.includes('british airways') || 
         content.includes('ba.com') ||
         /ba\d{3,4}/.test(content) ||
         content.includes('booking reference:') ||
         content.includes('world traveller') ||
         content.includes('club world');
}

export async function parseBA(input: ParseInput): Promise<ParsedTicket> {
  const text = input.text || '';
  const html = input.html || '';
  const content = text + '\n' + html;
  
  // Debug: BA parser processing ticket data
  
  const result: ParsedTicket = {
    carrier: 'BA',
    passengers: [],
    segments: [],
    raw: { text, html }
  };
  
  // Extract booking reference
  const bookingRefMatch = content.match(/booking reference:\s*([A-Z0-9]{6})/i);
  if (bookingRefMatch) {
    result.airlineLocator = bookingRefMatch[1];
  }
  
  // Extract passengers
  result.passengers = extractPassengers(content);
  
  // Extract ticket numbers
  result.tickets = extractTicketNumbers(content);
  
  // Extract flight segments
  result.segments = extractSegments(content);
  
  // Extract baggage information
  result.baggage = extractBaggage(content);
  result.handBaggage = extractHandBaggage(content);
  
  // Extract payments
  result.payments = extractPayments(content);
  
  // Extract fare details
  result.fareDetails = extractFareDetails(content);
  
  // Extract fare notes
  result.fareNotes = extractFareNotes(content);
  
  // Extract IATA number
  result.iataNumber = extractIataNumber(content);
  
  // Extract ticket validity
  if (result.tickets) {
    result.tickets = result.tickets.map(ticket => ({
      ...ticket,
      validUntil: extractTicketValidity(content)
    }));
  }
  
  // Check extraction quality and consider AI fallback
  const qualityScore = assessExtractionQuality(result);
  
  console.log(`BA regex extraction quality score: ${qualityScore.toFixed(2)}`);
  
  // Always try AI extraction if Groq is available (removed quality threshold)
  if (isGroqConfigured()) {
    console.log(`BA parser quality low, trying AI extraction with Groq...`);
    
    try {
      const extractionId = generateExtractionId();
      
      const aiResult = await extractTicket(
        text,
        html,
        result // Pass regex result as context
      );
      
      console.log(`AI extraction completed for BA ticket:`, {
        extractionId,
        model: aiResult.tokenUsage.model,
        cost: aiResult.tokenUsage.cost,
        retryUsed: aiResult.tokenUsage.retryUsed
      });
      
      // Record token usage
      await recordTokenUsage(aiResult, 'ba-parser-fallback', extractionId);
      
      // Use AI result if it seems better
      const aiQuality = assessExtractionQuality(aiResult.result);
      console.log(`AI extraction quality score: ${aiQuality.toFixed(2)}`);
      
      if (aiQuality > qualityScore) {
        console.log('Using AI extraction result (higher quality)');
        return aiResult.result;
      } else {
        console.log('Using regex extraction result (AI did not improve quality)');
      }
      
    } catch (error) {
      console.warn('AI extraction failed, using regex result:', error);
    }
  }
  
  return result;
}

/**
 * Assess the quality of extraction results
 * Returns a score from 0.0 (poor) to 1.0 (excellent)
 */
function assessExtractionQuality(result: ParsedTicket): number {
  let score = 0;
  let maxScore = 0;
  
  // Critical data presence (weight: 40%)
  maxScore += 40;
  if (result.airlineLocator && result.airlineLocator.length >= 5) score += 15; // Booking reference
  if (result.passengers.length > 0) score += 15; // Has passengers
  if (result.segments.length > 0) score += 10; // Has segments
  
  // Passenger data quality (weight: 30%)
  maxScore += 30;
  if (result.passengers.length > 0) {
    const validPassengers = result.passengers.filter(p => 
      p.fullName && 
      p.fullName.split(' ').length >= 2 && 
      p.fullName.split(' ').length <= 4 &&
      !/BAGGAGE|ALLOWANCE|FLIGHT|TICKET/.test(p.fullName)
    );
    score += (validPassengers.length / result.passengers.length) * 20; // Name quality
    score += Math.min(result.passengers.length * 5, 10); // Reasonable passenger count
  }
  
  // Segment data quality (weight: 20%)
  maxScore += 20;
  if (result.segments.length > 0) {
    const validSegments = result.segments.filter(s => 
      s.marketingFlightNo && 
      s.dep && 
      s.arr &&
      s.marketingFlightNo.match(/^[A-Z]{2,3}\d+$/)
    );
    score += (validSegments.length / result.segments.length) * 15; // Segment completeness
    score += Math.min(result.segments.length * 2.5, 5); // Reasonable segment count
  }
  
  // Additional data completeness (weight: 10%)
  maxScore += 10;
  if (result.baggage) score += 3;
  if (result.payments && result.payments.length > 0) score += 3;
  if (result.tickets && result.tickets.length > 0) score += 2;
  if (result.fareNotes) score += 2;
  
  return Math.min(score / maxScore, 1.0);
}

function extractPassengers(content: string): Array<{ fullName: string; type?: "ADT"|"CHD"|"INF" }> {
  const passengers: Array<{ fullName: string; type?: "ADT"|"CHD"|"INF" }> = [];
  
  // Passenger extraction with improved patterns and validation
  
  // Pattern 1: BA-specific dedicated passenger section (most reliable)
  const passengerSectionPattern = /\|\s*Passenger\s*\|\s*(MR|MRS|MS|MISS|DR)?\s*([A-Z][A-Z\s]+?)\s*\|/gi;
  let match;
  
  while ((match = passengerSectionPattern.exec(content)) !== null) {
    const nameText = match[2].trim();
    const nameParts = nameText.split(/\s+/).filter(part => part.length >= 2);
    
    if (nameParts.length >= 2 && nameParts.length <= 4) {
      let fullName = nameParts.join(' ');
      
      console.log(`BA Parser - Passenger section name: "${fullName}"`);
      
      // Pre-filter obvious non-names
      if (isObviousNonName(fullName)) {
        console.log(`BA Parser - Filtered out non-name from passenger section: "${fullName}"`);
        continue;
      }
      
      // Validate and clean name during extraction  
      const cleanedName = validateAndCleanName(fullName);
      if (cleanedName && !passengers.some(p => p.fullName === cleanedName)) {
        console.log(`BA Parser - Valid passenger name from section: "${cleanedName}"`);
        passengers.push({ fullName: cleanedName });
      }
    }
  }
  
  // Pattern 2: "Passenger" label followed by name (more specific)
  const passengerLabelPattern = /passenger\s*:?\s*(MR|MRS|MS|MISS|DR)?\s*([A-Z][A-Z]+(?:\s+[A-Z][A-Z]+){1,3})(?=\s*[\n|]|$)/gi;
  
  while ((match = passengerLabelPattern.exec(content)) !== null) {
    const nameText = match[2].trim();
    
    console.log(`BA Parser - Passenger label name: "${nameText}"`);
    
    // Pre-filter obvious non-names
    if (isObviousNonName(nameText)) {
      console.log(`BA Parser - Filtered out non-name from label: "${nameText}"`);
      continue;
    }
    
    // Validate and clean name during extraction  
    const cleanedName = validateAndCleanName(nameText);
    if (cleanedName && !passengers.some(p => p.fullName === cleanedName)) {
      console.log(`BA Parser - Valid passenger name from label: "${cleanedName}"`);
      passengers.push({ fullName: cleanedName });
    }
  }
  
  // Pattern 3: Look for names after ticket numbers (avoid payment/billing sections)
  const ticketLines = content.split('\n');
  for (let i = 0; i < ticketLines.length; i++) {
    const line = ticketLines[i].trim();
    
    // Skip if we're in a payment or billing section
    if (isInPaymentSection(content, i, ticketLines)) {
      continue;
    }
    
    // Check if line contains a ticket number pattern
    if (/\b125-\d{10}\b/.test(line)) {
      // Look for name on the same line after the ticket number
      const parts = line.split(/125-\d{10}/);
      if (parts.length > 1) {
        const namePart = parts[1].trim();
        const nameMatch = namePart.match(/^\(([A-Z][A-Z\s]+?)\)/);
        if (nameMatch) {
          const nameText = nameMatch[1].trim();
          const nameParts = nameText.split(/\s+/).filter(part => part.length >= 2);
          
          if (nameParts.length >= 2 && nameParts.length <= 4) {
            let fullName = nameParts.join(' ');
            
            console.log(`BA Parser - Ticket number name: "${fullName}"`);
            
            // Pre-filter obvious non-names
            if (isObviousNonName(fullName)) {
              console.log(`BA Parser - Filtered non-name from ticket: "${fullName}"`);
              continue;
            }
            
            const cleanedName = validateAndCleanName(fullName);
            if (cleanedName && !passengers.some(p => p.fullName === cleanedName)) {
              console.log(`BA Parser - Valid name from ticket: "${cleanedName}"`);
              passengers.push({ fullName: cleanedName });
            }
          }
        }
      }
    }
  }
  
  // Only use fallback patterns if no passengers found yet
  if (passengers.length === 0) {
    console.log('BA Parser - No passengers found, trying fallback patterns');
    
    // Fallback: Look for structured name patterns (avoid payment sections)
    const fallbackPattern = /(?<!(?:card\s+holder|cardholder|billing|payment)[^\n]{0,50})(?:MR|MRS|MS|MISS|DR)\s+([A-Z][A-Z]+(?:\s+[A-Z][A-Z]+){1,2})(?=\s*[\n|])/gi;
    
    while ((match = fallbackPattern.exec(content)) !== null) {
      const nameText = match[1].trim();
      
      console.log(`BA Parser - Fallback pattern name: "${nameText}"`);
      
      // Pre-filter obvious non-names
      if (isObviousNonName(nameText)) {
        console.log(`BA Parser - Filtered fallback non-name: "${nameText}"`);
        continue;
      }
      
      const cleanedName = validateAndCleanName(nameText);
      if (cleanedName && !passengers.some(p => p.fullName === cleanedName)) {
        console.log(`BA Parser - Valid fallback name: "${cleanedName}"`);
        passengers.push({ fullName: cleanedName });
        break; // Only take one fallback name
      }
    }
  }
  
  return passengers;
}

/**
 * Check if a line is in a payment or billing section
 */
function isInPaymentSection(content: string, currentLineIndex: number, lines: string[]): boolean {
  // Look for payment/billing keywords in nearby lines (±5 lines)
  const startIndex = Math.max(0, currentLineIndex - 5);
  const endIndex = Math.min(lines.length - 1, currentLineIndex + 5);
  
  const paymentKeywords = [
    'payment information',
    'payment method',
    'card holder',
    'cardholder',
    'billing address',
    'payment total',
    'card number',
    'visa',
    'mastercard'
  ];
  
  for (let i = startIndex; i <= endIndex; i++) {
    const line = lines[i].toLowerCase();
    if (paymentKeywords.some(keyword => line.includes(keyword))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Pre-filter to catch obvious non-names before processing
 */
function isObviousNonName(name: string): boolean {
  if (!name || name.length < 4) return true;
  
  const upperName = name.toUpperCase();
  
  // Common phrases that are definitely not names
  const obviousNonNames = [
    'IN YOUR BOOKING',
    'EACH PASSENGER', 
    'BAGGAGE ALLOWANCE',
    'HAND BAGGAGE',
    'CHECKED BAGGAGE',
    'FLIGHT DETAILS',
    'BOOKING REFERENCE',
    'TERMINAL INFORMATION',
    'CLASS DETAILS',
    'YOUR BOOKING',
    'PASSENGER DETAILS',
    'BOOKING CONFIRMATION'
  ];
  
  // Check for exact phrase matches
  for (const phrase of obviousNonNames) {
    if (upperName.includes(phrase)) {
      return true;
    }
  }
  
  // Check for common non-name words in sequence
  const words = upperName.split(/\s+/);
  const commonWords = ['IN', 'YOUR', 'THE', 'AND', 'OR', 'TO', 'FROM', 'FOR', 'WITH', 'EACH', 'ALL'];
  
  // If more than half the words are common English words, it's probably not a name
  const commonWordCount = words.filter(word => commonWords.includes(word)).length;
  if (commonWordCount > words.length / 2) {
    return true;
  }
  
  return false;
}

/**
 * Validates and cleans a passenger name during extraction, 
 * removing blacklisted words and trimming at the first non-name word
 */
function validateAndCleanName(name: string): string | null {
  if (!name || name.length < 4 || name.length > 50) return null;
  
  const nonNameWords = [
    'BAGGAGE', 'ALLOWANCES', 'ALLOWANCE', 'HAND', 'CHECKED', 'APPLY', 'EACH', 'PASSENGER', 
    'BOOKING', 'FLIGHT', 'DETAILS', 'TERMINAL', 'CLASS', 'INFORMATION', 
    'TOTAL', 'METHOD', 'TICKET', 'NUMBER', 'CONFIRMATION', 'REFERENCE',
    'DEPARTURE', 'ARRIVAL', 'TIME', 'DATE', 'FROM', 'TO', 'VIA', 'CABIN',
    'SEAT', 'GATE', 'AIRCRAFT', 'CODESHARE', 'OPERATED', 'BY',
    // Common English words that shouldn't be in names
    'IN', 'YOUR', 'THE', 'AND', 'OR', 'FOR', 'WITH', 'ALL', 'ANY',
    // Context words from airline tickets
    'MILES', 'POINTS', 'REWARD', 'STATUS', 'TIER', 'MEMBER', 'CLUB'
  ];
  
  const parts = name.split(/\s+/);
  const validParts: string[] = [];
  
  // Process each part, stopping at the first blacklisted word (case-insensitive)
  for (const part of parts) {
    if (nonNameWords.includes(part.toUpperCase())) {
      console.log(`BA Parser - Stopped at blacklisted word: "${part}" in name "${name}"`);
      break; // Stop processing at first blacklisted word
    }
    if (part.length >= 2) {
      validParts.push(part);
    } else {
      console.log(`BA Parser - Skipped short part: "${part}" in name "${name}"`);
    }
  }
  
  // Must have 2-4 valid parts (reasonable for names)
  if (validParts.length < 2 || validParts.length > 4) return null;
  
  const cleanedName = validParts.join(' ');
  
  // Final validation
  if (cleanedName.length < 4 || cleanedName.length > 50) return null;
  
  // Additional strict validation
  if (!isPlausibleName(cleanedName)) return null;
  
  return cleanedName;
}

/**
 * Check if a name looks plausible as a real person's name
 */
function isPlausibleName(name: string): boolean {
  const parts = name.split(/\s+/);
  
  // Each part should look like a proper name (not all consonants, not all vowels)
  for (const part of parts) {
    if (part.length < 2) return false;
    
    // Check for reasonable vowel/consonant distribution
    const vowels = (part.match(/[AEIOU]/g) || []).length;
    const consonants = (part.match(/[BCDFGHJKLMNPQRSTVWXYZ]/g) || []).length;
    
    // Names should have some vowels (not all consonants like "BCD")
    if (vowels === 0 && consonants > 2) return false;
    
    // Names shouldn't be all vowels either
    if (consonants === 0 && vowels > 1) return false;
    
    // Check for impossible letter combinations
    if (/^[BCDFGHJKLMNPQRSTVWXYZ]{4,}$/.test(part)) return false; // Too many consonants in a row
  }
  
  // Names should have reasonable length distribution
  const avgLength = parts.reduce((sum, part) => sum + part.length, 0) / parts.length;
  if (avgLength < 2 || avgLength > 12) return false;
  
  return true;
}

function isValidPassengerName(name: string): boolean {
  if (!name || name.length < 4 || name.length > 50) return false; // Add max length
  
  const parts = name.split(/\s+/);
  
  // Must have 2-4 parts (reasonable for names)
  if (parts.length < 2 || parts.length > 4) return false;
  
  // Each part must be at least 2 characters
  if (parts.some(part => part.length < 2)) return false;
  
  // Common non-name words that shouldn't be in passenger names
  const nonNameWords = [
    'BAGGAGE', 'ALLOWANCES', 'HAND', 'CHECKED', 'APPLY', 'EACH', 'PASSENGER', 
    'BOOKING', 'FLIGHT', 'DETAILS', 'TERMINAL', 'CLASS', 'INFORMATION', 
    'TOTAL', 'METHOD', 'TICKET', 'NUMBER', 'CONFIRMATION', 'REFERENCE',
    'DEPARTURE', 'ARRIVAL', 'TIME', 'DATE', 'FROM', 'TO', 'VIA'
  ];
  
  // Reject if contains any non-name words
  if (parts.some(part => nonNameWords.includes(part))) {
    return false;
  }
  
  // Filter out patterns that look like codes or abbreviations
  const suspiciousPatterns = [
    /^[A-Z]{1,3}$/, // Single letters like "AO", "T", "ZL"
    /^\d/, // Starts with numbers
    /^[BCDFGHJKLMNPQRSTVWXYZ]+$/, // All consonants (likely codes)
    /^(AM|PM|GMT|UTC|LHR|ACC|JFK|LAX|DXB)$/, // Common airport/time codes
  ];
  
  // Check if any part looks suspicious
  for (const part of parts) {
    if (suspiciousPatterns.some(pattern => pattern.test(part))) {
      return false;
    }
  }
  
  // Must contain at least one vowel across all parts (real names have vowels)
  const allText = parts.join('');
  if (!/[AEIOU]/.test(allText)) return false;
  
  return true;
}

function extractTicketNumbers(content: string): Array<{ number: string; paxName: string; validUntil?: string }> {
  const tickets: Array<{ number: string; paxName: string; validUntil?: string }> = [];
  
  // Pattern: "125-2214424598" under "Ticket Number(s)"
  const ticketPattern = /\b(125-\d{10})\b/g;
  let match;
  
  while ((match = ticketPattern.exec(content)) !== null) {
    const ticketNumber = match[1];
    
    // Try to find associated passenger name nearby
    const ticketIndex = content.indexOf(match[0]);
    const beforeTicket = content.substring(Math.max(0, ticketIndex - 200), ticketIndex);
    const afterTicket = content.substring(ticketIndex, ticketIndex + 200);
    
    const nameMatch = (beforeTicket + afterTicket).match(/([A-Z]{2,}\s+[A-Z\s]+)/);
    const paxName = nameMatch ? nameMatch[1].trim() : '';
    
    tickets.push({
      number: ticketNumber,
      paxName,
      validUntil: extractTicketValidity(content)
    });
  }
  
  return tickets;
}

function extractSegments(content: string): Array<{
  marketingFlightNo: string;
  cabin?: string;
  bookingClass?: string;
  dep: { iata?: string; city?: string; terminal?: string; timeLocal?: string; date?: string };
  arr: { iata?: string; city?: string; terminal?: string; timeLocal?: string; date?: string };
}> {
  const segments = [];
  
  // First, find all BA flight numbers
  const flightPattern = /(BA\d{3,4})/gi;
  const flightMatches: RegExpExecArray[] = [];
  let match;
  
  while ((match = flightPattern.exec(content)) !== null) {
    flightMatches.push(match);
  }
  
  for (const flightMatch of flightMatches) {
    const flightNo = flightMatch[1];
    const flightIndex = flightMatch.index!;
    
    // Get the content around this flight number (next 500 characters)
    const segmentContent = content.substring(flightIndex, flightIndex + 500);
    
    // Extract cabin class using multiple patterns
    let cabin: string | undefined;
    let bookingClass: string | undefined;
    
    // Pattern 1: Between pipes after British Airways
    const cabinMatch1 = segmentContent.match(/British Airways[^\n]*\|\s*([^|]+)\s*\|/);
    if (cabinMatch1) {
      cabin = cabinMatch1[1].trim();
    }
    
    // Pattern 2: World Traveller, Club World, etc. appearing independently
    const cabinMatch2 = segmentContent.match(/(World Traveller|Club World|First Class|Business|Economy)/i);
    if (!cabin && cabinMatch2) {
      cabin = cabinMatch2[1].trim();
    }
    
    // Pattern 3: "Cabin Class" followed by the cabin name
    const cabinMatch3 = segmentContent.match(/Cabin\s+Class\s*:?\s*([^\n]+)/i);
    if (!cabin && cabinMatch3) {
      cabin = cabinMatch3[1].trim();
    }
    
    // Extract booking class (usually a single letter)
    const classMatch = segmentContent.match(/Booking\s+Class\s*:?\s*([A-Z])/i);
    if (classMatch) {
      bookingClass = classMatch[1];
    }
    
    // Alternative class pattern: "Class: Y" or just "Y" in context
    if (!bookingClass) {
      const altClassMatch = segmentContent.match(/Class\s*:?\s*([A-Z])/i);
      if (altClassMatch) {
        bookingClass = altClassMatch[1];
      }
    }
    
    // Extract dates, times, cities, and terminals in sequence
    const lines = segmentContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let depDate = '', depTime = '', depCity = '', depTerminal = '';
    let arrDate = '', arrTime = '', arrCity = '', arrTerminal = '';
    
    let foundDepDate = false, foundDepTime = false, foundDepCity = false, foundDepTerminal = false;
    let foundArrDate = false, foundArrTime = false, foundArrCity = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip the flight number and British Airways line
      if (line.includes(flightNo) || line.includes('British Airways')) continue;
      
      // Date pattern: "30 Aug 2025"
      if (!foundDepDate && /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i.test(line)) {
        depDate = line;
        foundDepDate = true;
        continue;
      }
      
      // Time pattern: "22:10"
      if (foundDepDate && !foundDepTime && /^\d{1,2}:\d{2}$/.test(line)) {
        depTime = line;
        foundDepTime = true;
        continue;
      }
      
      // City pattern (after time)
      if (foundDepTime && !foundDepCity && line.length > 2 && !line.startsWith('Terminal')) {
        depCity = line;
        foundDepCity = true;
        continue;
      }
      
      // Terminal pattern (optional)
      if (foundDepCity && !foundDepTerminal && line.startsWith('Terminal')) {
        depTerminal = line.replace(/Terminal\s*/i, '').trim();
        foundDepTerminal = true;
        continue;
      }
      
      // Arrival date
      if (foundDepCity && !foundArrDate && /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i.test(line)) {
        arrDate = line;
        foundArrDate = true;
        continue;
      }
      
      // Arrival time
      if (foundArrDate && !foundArrTime && /^\d{1,2}:\d{2}$/.test(line)) {
        arrTime = line;
        foundArrTime = true;
        continue;
      }
      
      // Arrival city
      if (foundArrTime && !foundArrCity && line.length > 2 && !line.startsWith('Terminal')) {
        arrCity = line;
        foundArrCity = true;
        continue;
      }
      
      // Arrival terminal (optional)
      if (foundArrCity && line.startsWith('Terminal')) {
        arrTerminal = line.replace(/Terminal\s*/i, '').trim();
        break; // We've found everything for this segment
      }
    }
    
    // Only add segment if we have at least basic info
    if (depDate || depTime || depCity || arrDate || arrTime || arrCity) {
      segments.push({
        marketingFlightNo: flightNo,
        cabin: mapCabin(cabin),
        bookingClass: bookingClass,
        mealService: extractSegmentMealService(content, depCity, arrCity),
        dep: {
          date: depDate || undefined,
          timeLocal: depTime || undefined,
          city: extractCityName(depCity) || undefined,
          terminal: depTerminal || undefined,
          iata: extractIataCode(depCity) || undefined
        },
        arr: {
          date: arrDate || undefined,
          timeLocal: arrTime || undefined,
          city: extractCityName(arrCity) || undefined,
          terminal: arrTerminal || undefined,
          iata: extractIataCode(arrCity) || undefined
        }
      });
    }
  }
  
  return segments;
}

function mapCabin(cabin?: string): string | undefined {
  if (!cabin) return undefined;
  
  const cleanCabin = cabin.trim();
  return BA_CABIN_MAP[cleanCabin] || cleanCabin;
}

function extractCityName(location?: string): string | undefined {
  if (!location) return undefined;
  
  // Remove parenthetical content like "Heathrow (London)" -> "London"
  const parenMatch = location.match(/\(([^)]+)\)/);
  if (parenMatch) {
    return parenMatch[1].trim();
  }
  
  return location.trim();
}

function extractIataCode(location?: string): string | undefined {
  if (!location) return undefined;
  
  // Common airport mappings for BA destinations
  const airportMap: Record<string, string> = {
    'heathrow': 'LHR',
    'gatwick': 'LGW',
    'accra': 'ACC',
    'lagos': 'LOS',
    'abuja': 'ABV',
    'new york': 'JFK',
    'paris': 'CDG',
    'amsterdam': 'AMS',
    'dubai': 'DXB'
  };
  
  const locationLower = location.toLowerCase();
  for (const [city, code] of Object.entries(airportMap)) {
    if (locationLower.includes(city)) {
      return code;
    }
  }
  
  return undefined;
}

function extractBaggage(content: string): string | undefined {
  // Pattern: "2 bags at 23kg (51lbs)" or similar
  const baggagePatterns = [
    /(\d+)\s+bags?\s+at\s+(\d+)kg/i,
    /baggage\s+allowance[^:]*:\s*([^\n]+)/i,
    /(\d+)\s*x\s*(\d+)kg/i,
    /(\d+)\s*bags?\s*[^\d]*(\d+)\s*kg/i
  ];
  
  for (const pattern of baggagePatterns) {
    const match = content.match(pattern);
    if (match) {
      if (match.length >= 3) {
        return `${match[1]} x ${match[2]}kg`;
      } else {
        return match[1].trim();
      }
    }
  }
  
  return undefined;
}

function extractPayments(content: string): Array<{ currency: string; total: number; method?: string }> {
  const payments = [];
  
  // Pattern: "Payment Total USD 2230.00"
  const paymentPattern = /payment\s+total\s+([A-Z]{3})\s+([\d,]+\.?\d*)/gi;
  let match;
  
  while ((match = paymentPattern.exec(content)) !== null) {
    const currency = match[1];
    const amount = parseFloat(match[2].replace(/,/g, ''));
    
    // Try to find payment method nearby
    const paymentIndex = content.indexOf(match[0]);
    const nearbyText = content.substring(paymentIndex, paymentIndex + 200);
    const methodMatch = nearbyText.match(/(visa|mastercard|american express|amex|paypal|bank transfer)[^\n]*/i);
    
    payments.push({
      currency,
      total: amount,
      method: methodMatch ? methodMatch[1] : undefined
    });
  }
  
  return payments;
}

function extractFareNotes(content: string): string | undefined {
  // Pattern: "Endorsements Pax carrier restriction apply penalty applies"
  const endorsementMatches = content.match(/endorsements?\s*([^\n]+)/i);
  if (endorsementMatches) {
    return endorsementMatches[1].trim();
  }
  
  // Look for other fare restriction patterns
  const restrictionPatterns = [
    /fare\s+rules?[^:]*:\s*([^\n]+)/i,
    /penalties?\s*apply[^\n]*/i,
    /restrictions?\s*apply[^\n]*/i
  ];
  
  for (const pattern of restrictionPatterns) {
    const match = content.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  
  return undefined;
}

/**
 * Enriches AI-extracted ticket data with BA-specific information
 * This function adds BA-specific metadata that AI might miss
 */
export async function enrichBAData(aiResult: ParsedTicket, input: ParseInput): Promise<ParsedTicket> {
  const text = input.text || '';
  const html = input.html || '';
  const content = text + '\n' + html;
  
  console.log('Enriching AI result with BA-specific data');
  
  // Start with AI result
  const enrichedResult = { ...aiResult };
  
  // Only enrich missing data, don't override AI results
  try {
    // Extract booking reference if missing or looks incorrect
    if (!enrichedResult.airlineLocator || enrichedResult.airlineLocator.length < 5) {
      const bookingRefMatch = content.match(/booking reference:\s*([A-Z0-9]{6})/i);
      if (bookingRefMatch) {
        enrichedResult.airlineLocator = bookingRefMatch[1];
        console.log(`BA enrichment: Found booking reference ${bookingRefMatch[1]}`);
      }
    }

    // Extract ticket numbers if missing
    if (!enrichedResult.tickets || enrichedResult.tickets.length === 0) {
      enrichedResult.tickets = extractTicketNumbers(content);
      if (enrichedResult.tickets.length > 0) {
        console.log(`BA enrichment: Found ${enrichedResult.tickets.length} ticket numbers`);
      }
    }

    // Extract baggage if missing
    if (!enrichedResult.baggage) {
      enrichedResult.baggage = extractBaggage(content);
      if (enrichedResult.baggage) {
        console.log(`BA enrichment: Found baggage allowance ${enrichedResult.baggage}`);
      }
    }

    // Extract payments if missing
    if (!enrichedResult.payments || enrichedResult.payments.length === 0) {
      enrichedResult.payments = extractPayments(content);
      if (enrichedResult.payments.length > 0) {
        console.log(`BA enrichment: Found ${enrichedResult.payments.length} payment records`);
      }
    }

    // Extract fare notes if missing
    if (!enrichedResult.fareNotes) {
      enrichedResult.fareNotes = extractFareNotes(content);
      if (enrichedResult.fareNotes) {
        console.log(`BA enrichment: Found fare notes`);
      }
    }

    // Enrich segment data with BA-specific terminal/gate information
    if (enrichedResult.segments) {
      enrichedResult.segments = enrichedResult.segments.map((segment, index) => {
        return enrichSegmentWithBAData(segment, content, index);
      });
    }

    console.log('BA enrichment completed successfully');
    return enrichedResult;

  } catch (error) {
    console.warn('BA enrichment failed, returning AI result:', error);
    return aiResult;
  }
}

/**
 * Enriches a single segment with BA-specific data
 */
function enrichSegmentWithBAData(segment: any, content: string, segmentIndex: number) {
  try {
    // Look for terminal information near the flight number
    const flightNo = segment.marketingFlightNo;
    if (flightNo) {
      const flightIndex = content.indexOf(flightNo);
      if (flightIndex !== -1) {
        const segmentContent = content.substring(flightIndex, flightIndex + 800);
        
        // Extract departure terminal if missing
        if (!segment.dep?.terminal) {
          const depTerminalMatch = segmentContent.match(/departure[^:]*terminal[^:]*:?\s*([^,\n]+)/i);
          if (depTerminalMatch) {
            segment.dep = { ...segment.dep, terminal: depTerminalMatch[1].trim() };
          }
        }

        // Extract arrival terminal if missing
        if (!segment.arr?.terminal) {
          const arrTerminalMatch = segmentContent.match(/arrival[^:]*terminal[^:]*:?\s*([^,\n]+)/i);
          if (arrTerminalMatch) {
            segment.arr = { ...segment.arr, terminal: arrTerminalMatch[1].trim() };
          }
        }

        // Map cabin using BA-specific mappings if not already mapped
        if (segment.cabin) {
          const mappedCabin = mapCabin(segment.cabin);
          if (mappedCabin && mappedCabin !== segment.cabin) {
            segment.cabin = mappedCabin;
          }
        }
      }
    }
  } catch (error) {
    console.warn('Failed to enrich segment with BA data:', error);
  }
  
  return segment;
}

/**
 * Extract hand baggage allowance details
 */
function extractHandBaggage(content: string): string | undefined {
  // Pattern: "1 handbag/laptop bag, plus 1 additional cabin bag"
  const handBaggagePatterns = [
    /hand\s+baggage[^\n]*?(\d+\s+handbag\/laptop\s+bag[^\n]+)/i,
    /cabin\s+bag[^\n]*?(\d+\s+[^\n]+cabin\s+bag[^\n]*)/i,
    /(\d+\s+handbag\/laptop\s+bag,\s+plus\s+\d+\s+additional\s+cabin\s+bag)/i
  ];
  
  for (const pattern of handBaggagePatterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

/**
 * Extract fare details breakdown
 */
function extractFareDetails(content: string): { baseFare?: number; currency?: string; carrierCharges?: number; taxes?: Array<{ type: string; amount: number; description?: string }>; total?: number } | undefined {
  const fareDetails: any = {};
  
  // Extract base fare
  const baseFareMatch = content.match(/fare\s+details?\s+([A-Z]{3})\s+([\d,]+\.?\d*)/i);
  if (baseFareMatch) {
    fareDetails.baseFare = parseFloat(baseFareMatch[2].replace(/,/g, ''));
    fareDetails.currency = baseFareMatch[1];
  }
  
  // Extract carrier imposed charges
  const carrierChargeMatch = content.match(/carrier\s+imposed\s+charge\s+([A-Z]{3})\s+([\d,]+\.?\d*)/i);
  if (carrierChargeMatch) {
    fareDetails.carrierCharges = parseFloat(carrierChargeMatch[2].replace(/,/g, ''));
    if (!fareDetails.currency) fareDetails.currency = carrierChargeMatch[1];
  }
  
  // Extract taxes
  const taxes: Array<{ type: string; amount: number; description?: string }> = [];
  
  // Airport duty
  const airportDutyMatch = content.match(/air\s+passenger\s+duty[^\d]*([A-Z]{3})\s+([\d,]+\.?\d*)/i);
  if (airportDutyMatch) {
    taxes.push({
      type: 'APD',
      amount: parseFloat(airportDutyMatch[2].replace(/,/g, '')),
      description: 'Air Passenger Duty - United Kingdom'
    });
  }
  
  // Aviation safety charge
  const aviationChargeMatch = content.match(/aviation\s+safety\s+charge[^\d]*([A-Z]{3})\s+([\d,]+\.?\d*)/i);
  if (aviationChargeMatch) {
    taxes.push({
      type: 'ASC',
      amount: parseFloat(aviationChargeMatch[2].replace(/,/g, '')),
      description: 'Aviation Safety Charge - Ghana'
    });
  }
  
  // Passenger service charge
  const passengerChargeMatch = content.match(/passenger\s+service\s+charge[^\d]*([A-Z]{3})\s+([\d,]+\.?\d*)/i);
  if (passengerChargeMatch) {
    taxes.push({
      type: 'PSC',
      amount: parseFloat(passengerChargeMatch[2].replace(/,/g, '')),
      description: 'Passenger Service Charge'
    });
  }
  
  if (taxes.length > 0) {
    fareDetails.taxes = taxes;
  }
  
  // Extract total
  const totalMatch = content.match(/payment\s+total\s+([A-Z]{3})\s+([\d,]+\.?\d*)/i);
  if (totalMatch) {
    fareDetails.total = parseFloat(totalMatch[2].replace(/,/g, ''));
    if (!fareDetails.currency) fareDetails.currency = totalMatch[1];
  }
  
  return Object.keys(fareDetails).length > 0 ? fareDetails : undefined;
}

/**
 * Extract IATA number
 */
function extractIataNumber(content: string): string | undefined {
  const iataMatch = content.match(/iata\s+number\s*:?\s*(\d+)/i);
  return iataMatch ? iataMatch[1] : undefined;
}

/**
 * Extract ticket validity date
 */
function extractTicketValidity(content: string): string | undefined {
  const validityMatch = content.match(/ticket\(s\)\s+valid\s+until\s+(\d{1,2}\s+\w+\s+\d{4})/i);
  return validityMatch ? validityMatch[1] : undefined;
}

/**
 * Extract meal service information for segments
 */
function extractMealService(content: string, segments: Array<any>): Array<{ segmentIndex: number; service: string }> | undefined {
  const mealServices: Array<{ segmentIndex: number; service: string }> = [];
  
  // Look for meal service table
  const mealTableMatch = content.match(/flights\s+meals?\s+([\s\S]*?)(?=\n\n|\n[A-Z]|$)/i);
  if (!mealTableMatch) return undefined;
  
  const mealTable = mealTableMatch[1];
  const lines = mealTable.split('\n').map(line => line.trim()).filter(line => line);
  
  let segmentIndex = 0;
  for (const line of lines) {
    if (line.toLowerCase().includes('to')) {
      // This is a route line, extract meal service
      const mealMatch = line.match(/meal|food\s+and\s+beverages?\s+for\s+purchase/i);
      if (mealMatch && segmentIndex < segments.length) {
        mealServices.push({
          segmentIndex,
          service: mealMatch[0]
        });
        segmentIndex++;
      }
    }
  }
  
  return mealServices.length > 0 ? mealServices : undefined;
}

/**
 * Extract meal service for a specific segment based on route
 */
function extractSegmentMealService(content: string, depCity?: string, arrCity?: string): string | undefined {
  if (!depCity || !arrCity) return undefined;
  
  // Create route patterns to match
  const routePatterns = [
    new RegExp(`${depCity.toLowerCase()}\\s+to\\s+${arrCity.toLowerCase()}[^\\n]*?(meal|food\\s+and\\s+beverages?\\s+for\\s+purchase)`, 'i'),
    new RegExp(`${extractCityName(depCity)?.toLowerCase()}\\s+to\\s+${extractCityName(arrCity)?.toLowerCase()}[^\\n]*?(meal|food\\s+and\\s+beverages?\\s+for\\s+purchase)`, 'i')
  ];
  
  for (const pattern of routePatterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return undefined;
}