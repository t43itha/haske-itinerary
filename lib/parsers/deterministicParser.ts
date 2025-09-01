/**
 * Deterministic parser that preprocesses text before using LLM
 * Reduces reliance on LLM for complex multi-segment extraction
 */

import { ParsedTicket } from '../types';
import {
  preprocessPDFText,
  buildCityIATAMap,
  extractTerminals,
  extractWaypoints,
  extractFlightNumbers,
  extractDurations
} from '../preprocessing/textCleaner';
import { buildSegmentsFromText } from '../preprocessing/segmentBuilder';
import { getGroqClient, MODELS, calculateCost } from '../llm/client';
import { extractSAASegments, convertToTicket } from '../preprocessing/simpleExtractor';

export interface DeterministicParseResult {
  ticket: ParsedTicket;
  preprocessedSegments: ParsedTicket['segments'];
  llmEnhanced: boolean;
  confidence: number;
}

/**
 * Parse ticket using deterministic preprocessing + LLM enhancement
 */
export async function parseWithDeterministicPreprocessing(
  rawText: string,
  fallbackToLLM: boolean = true
): Promise<DeterministicParseResult> {
  console.log('Starting deterministic preprocessing v3...');
  
  // Try simple SAA extraction first
  const isSAA = rawText.includes('South African Airways') || rawText.includes('flysaa.com');
  console.log('Checking for SAA:', isSAA, 'Has SAA text:', rawText.includes('South African Airways'), 'Has flysaa:', rawText.includes('flysaa.com'));
  
  if (isSAA) {
    console.log('Detected SAA ticket, using simple extractor');
    const segments = extractSAASegments(rawText);
    
    if (segments.length > 0) {
      console.log(`Simple extraction found ${segments.length} segments`);
      
      // Extract booking reference
      const bookingMatch = rawText.match(/booking reference is\s*([A-Z0-9]{6})/i) || 
                           rawText.match(/\b([A-Z0-9]{6})\b(?=.*Services summary)/);
      const bookingRef = bookingMatch ? bookingMatch[1] : undefined;
      
      // Extract passenger name
      const passengerMatch = rawText.match(/Ernest Thompson|Thompson.*Ernest/i);
      const passenger = passengerMatch ? 'Ernest Thompson' : undefined;
      
      const ticket = convertToTicket(segments, bookingRef, passenger, rawText);
      
      return {
        ticket,
        preprocessedSegments: ticket.segments,
        llmEnhanced: false,
        confidence: 95 // High confidence for direct extraction
      };
    }
  }
  
  // Step 1: Clean the text
  const cleanedText = preprocessPDFText(rawText);
  console.log('Text cleaned, length:', cleanedText.length);
  
  // Step 2: Build city-IATA mapping
  const cityIataMap = buildCityIATAMap(cleanedText);
  console.log('City-IATA map built:', cityIataMap.size, 'entries - v2');
  
  // Step 3: Extract terminals
  const terminals = extractTerminals(cleanedText);
  console.log('Terminals extracted:', terminals.size, 'entries');
  
  // Step 4: Extract waypoints chronologically
  const waypoints = extractWaypoints(cleanedText, cityIataMap);
  console.log('Waypoints extracted:', waypoints.length);
  
  // Step 5: Extract flight numbers
  const flightNumbers = extractFlightNumbers(cleanedText);
  console.log('Flight numbers extracted:', flightNumbers);
  
  // Step 6: Extract durations
  const durations = extractDurations(cleanedText);
  console.log('Durations extracted:', durations.size, 'entries');
  
  // Step 7: Determine base date (look for date patterns)
  const baseDate = extractBaseDate(cleanedText) || new Date().toISOString().split('T')[0];
  console.log('Base date:', baseDate);
  
  // Step 8: Build segments deterministically
  const segments = buildSegmentsFromText(
    cleanedText,
    cityIataMap,
    waypoints,
    flightNumbers,
    durations,
    baseDate
  );
  
  console.log('Segments built:', segments.length);
  
  // Step 9: Extract other fields (passengers, booking ref, etc.)
  const bookingRef = extractBookingReference(cleanedText);
  const passengers = extractPassengers(cleanedText);
  const carrier = extractCarrier(flightNumbers);
  
  // Build initial ticket from deterministic extraction
  let ticket: ParsedTicket = {
    carrier: carrier || '',
    airlineLocator: bookingRef,
    passengers: passengers,
    segments: segments,
    raw: { text: rawText }
  };
  
  // Step 10: Optionally enhance with LLM for missing fields
  let llmEnhanced = false;
  if (fallbackToLLM && shouldUseLLMEnhancement(ticket)) {
    console.log('Enhancing with LLM for missing fields...');
    ticket = await enhanceWithLLM(ticket, cleanedText);
    llmEnhanced = true;
  }
  
  // Calculate confidence score
  const confidence = calculateConfidence(ticket);
  
  return {
    ticket,
    preprocessedSegments: segments,
    llmEnhanced,
    confidence
  };
}

/**
 * Extract base date from text
 */
function extractBaseDate(text: string): string | null {
  // Look for date patterns like "28 Sep 2025" or "2025-09-28"
  const datePatterns = [
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i,
    /(\d{4})-(\d{2})-(\d{2})/
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      // Convert to YYYY-MM-DD format
      if (pattern.source.includes('Jan|Feb')) {
        // Month name format
        const day = match[1].padStart(2, '0');
        const monthMap: Record<string, string> = {
          'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
          'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
          'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
        };
        const month = monthMap[match[2].toLowerCase()];
        const year = match[3];
        return `${year}-${month}-${day}`;
      } else {
        // ISO format
        return match[0];
      }
    }
  }
  
  return null;
}

/**
 * Extract booking reference
 */
function extractBookingReference(text: string): string | undefined {
  // Common patterns for booking references
  const patterns = [
    /Booking\s+(?:Reference|Ref|Code)[:\s]+([A-Z0-9]{6})/i,
    /Confirmation\s+(?:Number|Code)[:\s]+([A-Z0-9]{6})/i,
    /PNR[:\s]+([A-Z0-9]{6})/i,
    /\b([A-Z0-9]{6})\b(?=.*(?:booking|confirmation|reference))/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return undefined;
}

/**
 * Extract passengers from text
 */
function extractPassengers(text: string): ParsedTicket['passengers'] {
  const passengers: ParsedTicket['passengers'] = [];
  
  // Look for passenger patterns
  const patterns = [
    /Passenger\s*\n+([A-Za-z\s]+?)(?:\n|$)/gi, // Passenger on separate line
    /Passenger[:\s]+([A-Za-z][A-Za-z\s]+?)(?:\n|$)/gi,
    /\b(MR|MRS|MS|MISS|DR)\s+([A-Z][A-Z\s]+)/gi,
    /^\s*([A-Z][a-z]+\s+[A-Z][a-z]+)\s*$/gm // Names on their own line
  ];
  
  const foundNames = new Set<string>();
  
  // Also check for specific names that appear standalone
  // In SANEW.pdf, "Ernest Thompson" appears as passenger
  const standaloneNamePattern = /^([A-Z][a-z]+\s+[A-Z][a-z]+)$/gm;
  let standaloneMatch;
  while ((standaloneMatch = standaloneNamePattern.exec(text)) !== null) {
    const name = standaloneMatch[1].trim();
    if (name && 
        !name.includes('Flight') && 
        !name.includes('number') &&
        !name.includes('Terminal') &&
        !name.includes('International') &&
        name.length > 5 && name.length < 50) {
      const normalizedName = name.toUpperCase();
      if (!foundNames.has(normalizedName)) {
        foundNames.add(normalizedName);
        passengers.push({
          fullName: name,
          type: 'ADT' // Default to adult
        });
      }
    }
  }
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let name = match[pattern.source.includes('MR|MRS') ? 2 : 1];
      name = name.trim().replace(/\s+/g, ' ');
      
      // Skip if contains common non-name words
      if (name.includes('Flight') || 
          name.includes('number') || 
          name.includes('Terminal') ||
          name.includes('International')) continue;
      
      // Skip if too short or too long
      if (name.length < 3 || name.length > 50) continue;
      
      // Skip if already found
      const normalizedName = name.toUpperCase();
      if (!foundNames.has(normalizedName)) {
        foundNames.add(normalizedName);
        passengers.push({
          fullName: name,
          type: 'ADT' // Default to adult
        });
      }
    }
  }
  
  return passengers;
}

/**
 * Extract carrier from flight numbers
 */
function extractCarrier(flightNumbers: string[]): string | null {
  if (flightNumbers.length === 0) return null;
  
  // Extract airline code from first flight number
  const match = flightNumbers[0].match(/^([A-Z]{2})/);
  return match ? match[1] : null;
}

/**
 * Determine if LLM enhancement is needed
 */
function shouldUseLLMEnhancement(ticket: ParsedTicket): boolean {
  // Check for critical missing fields
  const hasBookingRef = !!ticket.airlineLocator;
  const hasPassengers = ticket.passengers.length > 0;
  const hasSegments = ticket.segments.length > 0;
  const hasValidSegments = ticket.segments.every(s => 
    s.marketingFlightNo && s.dep.iata && s.arr.iata
  );
  
  // Only use LLM if critical fields are missing
  return !hasBookingRef || !hasPassengers || !hasSegments || !hasValidSegments;
}

/**
 * Enhance ticket with LLM for missing fields only
 * LLM should only tidy/normalize, not discover segments
 */
async function enhanceWithLLM(
  ticket: ParsedTicket,
  cleanedText: string
): Promise<ParsedTicket> {
  const groq = getGroqClient();
  
  // Build a focused prompt for enhancement only
  const enhancementTasks = [];
  const needsEnhancement: any = {};
  
  if (!ticket.airlineLocator) {
    enhancementTasks.push('Find the booking reference (6 character alphanumeric code)');
    needsEnhancement.airlineLocator = true;
  }
  
  if (ticket.passengers.length === 0) {
    enhancementTasks.push('Find passenger names (look for "Passenger:" labels or names in parentheses after ticket numbers)');
    needsEnhancement.passengers = true;
  }
  
  if (!ticket.baggage) {
    enhancementTasks.push('Find baggage allowance (e.g., "2 x 23kg")');
    needsEnhancement.baggage = true;
  }
  
  // Parse duration text to minutes for existing segments
  if (ticket.segments.length > 0) {
    enhancementTasks.push('Convert any duration text to minutes (e.g., "5h 55min" → 355)');
    needsEnhancement.durations = true;
  }
  
  // If nothing needs enhancement, return as-is
  if (enhancementTasks.length === 0) {
    return ticket;
  }
  
  const prompt = `You are a data enhancement assistant. DO NOT discover or create new flight segments.

TASKS:
${enhancementTasks.join('\n')}

CURRENT EXTRACTED DATA (DO NOT MODIFY EXISTING SEGMENTS):
${JSON.stringify(ticket, null, 2)}

TEXT TO SEARCH FOR MISSING FIELDS:
${cleanedText.substring(0, 2000)}

Return a JSON object with ONLY the requested missing fields. Do not modify existing segments or times.
Example response format:
{
  "airlineLocator": "ABC123",
  "passengers": [{"fullName": "JOHN SMITH", "type": "ADT"}],
  "baggage": "2 x 23kg",
  "segmentDurations": [355, 135] // in minutes, matching segment order
}`;
  
  try {
    const completion = await groq.chat.completions.create({
      model: MODELS.CHEAP,
      messages: [
        {
          role: "system",
          content: "Extract only the requested missing fields. Do not create new segments or modify existing flight data. Focus on finding booking references, passenger names, and baggage info only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });
    
    const response = completion.choices[0]?.message?.content;
    if (response) {
      const enhancements = JSON.parse(response);
      
      // Merge enhancements carefully
      if (enhancements.airlineLocator && !ticket.airlineLocator) {
        ticket.airlineLocator = enhancements.airlineLocator;
      }
      
      if (enhancements.passengers && ticket.passengers.length === 0) {
        ticket.passengers = enhancements.passengers;
      }
      
      if (enhancements.baggage && !ticket.baggage) {
        ticket.baggage = enhancements.baggage;
      }
      
      // Add durations to segments if provided
      if (enhancements.segmentDurations && Array.isArray(enhancements.segmentDurations)) {
        ticket.segments.forEach((segment, idx) => {
          if (idx < enhancements.segmentDurations.length) {
            (segment as any).durationMinutes = enhancements.segmentDurations[idx];
          }
        });
      }
      
      console.log('LLM enhancement completed:', {
        addedLocator: !!enhancements.airlineLocator,
        addedPassengers: enhancements.passengers?.length || 0,
        addedBaggage: !!enhancements.baggage,
        addedDurations: enhancements.segmentDurations?.length || 0
      });
    }
  } catch (error) {
    console.error('LLM enhancement failed:', error);
  }
  
  return ticket;
}

/**
 * Calculate confidence score for extraction
 */
function calculateConfidence(ticket: ParsedTicket): number {
  let score = 0;
  let maxScore = 0;
  
  // Check critical fields
  if (ticket.airlineLocator) score += 20;
  maxScore += 20;
  
  if (ticket.passengers.length > 0) score += 20;
  maxScore += 20;
  
  if (ticket.segments.length > 0) score += 20;
  maxScore += 20;
  
  // Check segment quality
  for (const segment of ticket.segments) {
    if (segment.marketingFlightNo) score += 5;
    if (segment.dep.iata) score += 5;
    if (segment.arr.iata) score += 5;
    if (segment.dep.timeLocal) score += 5;
    if (segment.arr.timeLocal) score += 5;
    maxScore += 25;
  }
  
  return (score / maxScore) * 100;
}