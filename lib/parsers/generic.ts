import { ParsedTicket, GENERIC_CABIN_MAP, PAX_TYPE_MAP } from '../types';
import { ParseInput } from './index';
import { extractTicket } from '../llm/extractTicket';
import { recordTokenUsage, generateExtractionId } from '../llm/tokenTracking';
import { isGroqConfigured } from '../llm/client';
import { parseWithDeterministicPreprocessing } from './deterministicParser';

// Common airline lexicon and patterns for post-processing
const AIRLINE_CODES = [
  'BA', 'AF', 'KL', 'LH', 'VS', 'AA', 'DL', 'UA', 'EK', 'QR', 'SQ', 'CX', 'SA'
];

const IATA_AIRPORTS = {
  'LHR': 'London Heathrow',
  'LGW': 'London Gatwick', 
  'CDG': 'Paris Charles de Gaulle',
  'AMS': 'Amsterdam Schiphol',
  'FRA': 'Frankfurt',
  'DXB': 'Dubai',
  'JFK': 'New York JFK',
  'LAX': 'Los Angeles',
  'ACC': 'Accra',
  'LOS': 'Lagos',
  'ABV': 'Abuja'
};

export async function parseGeneric(input: ParseInput, carrierHint?: string): Promise<ParsedTicket> {
  if (!isGroqConfigured()) {
    console.warn('Groq API not configured, using basic extraction');
    return parseBasic(input);
  }

  try {
    const detectedCarrier = carrierHint || detectCarrier(input);
    
    console.log('Starting generic parser with deterministic preprocessing v2:', { 
      carrierHint: detectedCarrier,
      timestamp: new Date().toISOString()
    });
    
    // FIRST: Try deterministic preprocessing with optional LLM enhancement
    // This reduces reliance on LLM for complex multi-segment extraction
    console.log('Attempting deterministic preprocessing...');
    try {
      const deterministicResult = await parseWithDeterministicPreprocessing(
        input.text || '',
        true // Allow LLM enhancement for missing fields only
      );
      
      console.log('Deterministic preprocessing completed:', {
        segments: deterministicResult.preprocessedSegments.length,
        llmEnhanced: deterministicResult.llmEnhanced,
        confidence: deterministicResult.confidence
      });
      
      // If confidence is high enough, use the result
      if (deterministicResult.confidence > 70) {
        const finalTicket = postProcessTicket(deterministicResult.ticket, input);
        console.log('Using deterministic result with confidence:', deterministicResult.confidence);
        return finalTicket;
      }
      
      console.log('Deterministic confidence too low:', deterministicResult.confidence, ', falling back to full LLM extraction');
    } catch (deterministicError) {
      console.warn('Deterministic preprocessing failed:', deterministicError);
      // Continue to full LLM extraction
    }
    
    // FALLBACK: Full LLM extraction if deterministic approach fails or has low confidence
    const extractionId = generateExtractionId();
    
    console.log('Falling back to full LLM extraction:', { 
      extractionId, 
      carrierHint: detectedCarrier 
    });
    
    // Pass carrier hint to improve AI extraction accuracy
    const extractionResult = await extractTicket(
      input.text,
      input.html,
      null, // No current parse for generic extraction
      detectedCarrier || undefined // Pass carrier hint to AI
    );
    
    console.log('LLM extraction completed:', {
      extractionId,
      carrier: detectedCarrier,
      model: extractionResult.tokenUsage.model,
      cost: extractionResult.tokenUsage.cost,
      retryUsed: extractionResult.tokenUsage.retryUsed
    });
    
    // Record token usage for cost tracking
    await recordTokenUsage(
      extractionResult,
      detectedCarrier ? `generic-parser-${detectedCarrier.toLowerCase()}` : 'generic-parser',
      extractionId
    );
    
    return postProcessTicket(extractionResult.result, input);
  } catch (error) {
    console.error('All extraction methods failed, falling back to basic parsing:', error);
    return parseBasic(input);
  }
}

// Helper function to detect carrier from input
function detectCarrier(input: ParseInput): string | null {
  const text = input.text || '';
  const html = input.html || '';
  const content = (text + ' ' + html).toLowerCase();
  
  // British Airways
  if (content.includes('british airways') || 
      content.includes('ba.com') ||
      /ba\d{3,4}/.test(content)) {
    return 'BA';
  }
  
  // Air France
  if (content.includes('air france') || 
      content.includes('airfrance.') ||
      /af\d{3,4}/.test(content)) {
    return 'AF';
  }
  
  // KLM
  if (content.includes('klm ') || 
      content.includes('klm.') ||
      /kl\d{3,4}/.test(content)) {
    return 'KL';
  }
  
  // Lufthansa
  if (content.includes('lufthansa') || 
      content.includes('lufthansa.') ||
      /lh\d{3,4}/.test(content)) {
    return 'LH';
  }
  
  // Virgin Atlantic
  if (content.includes('virgin atlantic') || 
      content.includes('virgin-atlantic.') ||
      /vs\d{3,4}/.test(content)) {
    return 'VS';
  }
  
  // South African Airways
  if (content.includes('south african airways') || 
      content.includes('flysaa.com') ||
      /\bsa\s?\d{3,4}/i.test(content)) {
    return 'SA';
  }
  
  return null;
}


function postProcessTicket(ticket: ParsedTicket, originalInput: ParseInput): ParsedTicket {
  // Ensure we have the raw data
  ticket.raw = originalInput;

  // Validate and normalize flight numbers
  if (ticket.segments) {
    ticket.segments = ticket.segments.map(segment => ({
      ...segment,
      marketingFlightNo: normalizeFlightNumber(segment.marketingFlightNo),
      dep: normalizeLocationData(segment.dep),
      arr: normalizeLocationData(segment.arr)
    }));
  }

  // Normalize cabin classes
  if (ticket.segments) {
    ticket.segments = ticket.segments.map(segment => ({
      ...segment,
      cabin: normalizeCabin(segment.cabin)
    }));
  }

  // Validate passenger types
  if (ticket.passengers) {
    ticket.passengers = ticket.passengers.map(pax => ({
      ...pax,
      type: normalizePassengerType(pax.type)
    }));
  }

  // Ensure carrier is uppercase
  if (ticket.carrier) {
    ticket.carrier = ticket.carrier.toUpperCase();
  }

  return ticket;
}

function normalizeFlightNumber(flightNo?: string): string {
  if (!flightNo) return '';
  
  const cleaned = flightNo.replace(/\s+/g, '').toUpperCase();
  
  // Validate flight number pattern (2-3 letter airline code + 1-4 digits)
  const flightPattern = /^([A-Z]{2,3})(\d{1,4})$/;
  const match = cleaned.match(flightPattern);
  
  if (match) {
    const [, airline, number] = match;
    if (AIRLINE_CODES.includes(airline)) {
      return `${airline}${number.padStart(4, '0')}`;
    }
  }
  
  return cleaned;
}

function normalizeLocationData(location: any) {
  if (!location) return {};
  
  return {
    ...location,
    iata: normalizeIataCode(location.iata),
    timeLocal: normalizeTime(location.timeLocal)
  };
}

function normalizeIataCode(iata?: string): string | undefined {
  if (!iata) return undefined;
  
  const cleaned = iata.toUpperCase().replace(/[^A-Z]/g, '');
  
  // Validate 3-letter IATA code
  if (cleaned.length === 3 && /^[A-Z]{3}$/.test(cleaned)) {
    return cleaned;
  }
  
  return undefined;
}

function normalizeTime(time?: string): string | undefined {
  if (!time) return undefined;
  
  // Handle various time formats and convert to 24hr HH:MM
  const timePattern = /(\d{1,2})[:\.]?(\d{2})?\s*(AM|PM)?/i;
  const match = time.match(timePattern);
  
  if (match) {
    let [, hours, minutes = '00', period] = match;
    let hour = parseInt(hours, 10);
    
    // Convert 12hr to 24hr format
    if (period) {
      const upperPeriod = period.toUpperCase();
      if (upperPeriod === 'PM' && hour !== 12) {
        hour += 12;
      } else if (upperPeriod === 'AM' && hour === 12) {
        hour = 0;
      }
    }
    
    // Validate 24hr format
    if (hour < 0 || hour > 23) {
      console.warn(`Invalid hour in time: ${time}`);
      return time; // Return original if invalid
    }
    
    const min = parseInt(minutes, 10);
    if (min < 0 || min > 59) {
      console.warn(`Invalid minutes in time: ${time}`);
      return time; // Return original if invalid
    }
    
    return `${hour.toString().padStart(2, '0')}:${minutes.padStart(2, '0')}`;
  }
  
  // Validate existing HH:MM format
  const validTimePattern = /^([0-2]\d):([0-5]\d)$/;
  const validMatch = time.match(validTimePattern);
  if (validMatch) {
    const hour = parseInt(validMatch[1]);
    if (hour <= 23) {
      return time; // Already valid 24hr format
    }
  }
  
  console.warn(`Could not normalize time: ${time}`);
  return time;
}

function normalizeCabin(cabin?: string): string | undefined {
  if (!cabin) return undefined;
  
  const cleanCabin = cabin.trim();
  return GENERIC_CABIN_MAP[cleanCabin] || cleanCabin;
}

function normalizePassengerType(type?: string): "ADT" | "CHD" | "INF" | undefined {
  if (!type) return undefined;
  
  const upperType = type.toUpperCase();
  return ['ADT', 'CHD', 'INF'].includes(upperType) ? upperType as any : undefined;
}

// Basic fallback parser without LLM
function parseBasic(input: ParseInput): ParsedTicket {
  const text = input.text || '';
  const html = input.html || '';
  const content = text + '\n' + html;
  
  const result: ParsedTicket = {
    carrier: 'UNKNOWN',
    passengers: [],
    segments: [],
    raw: input
  };
  
  // Basic flight number extraction
  const flightPattern = /\b([A-Z]{2,3}\d{3,4})\b/g;
  let match;
  
  while ((match = flightPattern.exec(content)) !== null) {
    const flightNo = match[1];
    if (AIRLINE_CODES.some(code => flightNo.startsWith(code))) {
      result.segments.push({
        marketingFlightNo: flightNo,
        dep: {},
        arr: {}
      });
      
      if (!result.carrier || result.carrier === 'UNKNOWN') {
        result.carrier = flightNo.substring(0, 2);
      }
    }
  }
  
  // Basic passenger extraction  
  const namePattern = /passenger[^:]*:\s*([A-Z\s]+)/gi;
  let nameMatch;
  
  while ((nameMatch = namePattern.exec(content)) !== null) {
    const name = nameMatch[1].trim();
    if (name.length > 3) {
      result.passengers.push({ fullName: name });
    }
  }
  
  return result;
}