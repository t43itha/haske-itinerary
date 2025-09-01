import { ParsedTicket } from '../types';
import { getGroqClient, MODELS, calculateCost } from './client';
import { ParsedTicketSchema, LLMPromptResponseSchema, isValidExtraction } from './schemas';

export interface ExtractionInput {
  rawText?: string;
  rawHtml?: string;
  currentParse?: ParsedTicket | null;
  carrierHint?: string;
}

export interface ExtractionResult {
  result: ParsedTicket;
  tokenUsage: {
    model: string;
    tokensIn: number;
    tokensOut: number;
    cost: number;
    retryUsed: boolean;
  };
}

/**
 * Main extraction function with intelligent model routing
 */
export async function extractTicket(
  rawText?: string,
  rawHtml?: string,
  currentParse?: ParsedTicket | null,
  carrierHint?: string
): Promise<ExtractionResult> {
  const input: ExtractionInput = { rawText, rawHtml, currentParse, carrierHint };
  
  console.log('Starting LLM extraction with model router');
  
  try {
    // First attempt with cheap 8B model
    console.log(`Attempting extraction with ${MODELS.CHEAP} model`);
    const result8B = await extractWithModel(MODELS.CHEAP, input);
    
    console.log('8B model extraction result tokens:', {
      in: result8B.tokenUsage.tokensIn,
      out: result8B.tokenUsage.tokensOut,
      cost: result8B.tokenUsage.cost
    });
    
    // Validate critical fields
    if (isValidExtraction(result8B.result)) {
      console.log('8B model extraction successful - critical fields present');
      return {
        result: result8B.result,
        tokenUsage: {
          ...result8B.tokenUsage,
          retryUsed: false
        }
      };
    }
    
    // Retry with powerful 70B model if missing critical data
    console.log('Missing critical fields, retrying with 70B model');
    const result70B = await extractWithModel(MODELS.BURST, input);
    
    console.log('70B model extraction result tokens:', {
      in: result70B.tokenUsage.tokensIn,
      out: result70B.tokenUsage.tokensOut,
      cost: result70B.tokenUsage.cost
    });
    
    // Combine token usage from both attempts
    const combinedTokenUsage = {
      model: `${MODELS.CHEAP} + ${MODELS.BURST}`,
      tokensIn: result8B.tokenUsage.tokensIn + result70B.tokenUsage.tokensIn,
      tokensOut: result8B.tokenUsage.tokensOut + result70B.tokenUsage.tokensOut,
      cost: result8B.tokenUsage.cost + result70B.tokenUsage.cost,
      retryUsed: true
    };
    
    return {
      result: result70B.result,
      tokenUsage: combinedTokenUsage
    };
    
  } catch (error) {
    console.error('LLM extraction failed:', error);
    throw new Error(`LLM extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract with a specific model
 */
async function extractWithModel(model: string, input: ExtractionInput) {
  const content = buildContentString(input);
  const groq = getGroqClient();
  
  const systemPrompt = buildSystemPrompt(input.carrierHint);
  const userPrompt = `Extract flight information from this e-ticket content:\n\n${content}`;
  
  console.log(`Making Groq API call with model: ${model}, carrier hint: ${input.carrierHint}`);
  
  const completion = await groq.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1, // Low temperature for consistent extraction
  });
  
  const response = completion.choices[0]?.message?.content;
  if (!response) {
    throw new Error('No response from LLM');
  }
  
  // Parse and validate the response
  let parsedResponse;
  try {
    parsedResponse = JSON.parse(response);
  } catch (error) {
    throw new Error('Invalid JSON response from LLM');
  }
  
  // Validate against schema
  const validatedResponse = LLMPromptResponseSchema.parse(parsedResponse);
  
  // Convert to ParsedTicket format with raw data
  const result: ParsedTicket = {
    ...validatedResponse,
    raw: {
      text: input.rawText,
      html: input.rawHtml
    }
  };
  
  // Calculate token usage and cost
  const tokensIn = completion.usage?.prompt_tokens || 0;
  const tokensOut = completion.usage?.completion_tokens || 0;
  const cost = calculateCost(model, tokensIn, tokensOut);
  
  return {
    result,
    tokenUsage: {
      model,
      tokensIn,
      tokensOut,
      cost
    }
  };
}

/**
 * Build content string from input
 */
function buildContentString(input: ExtractionInput): string {
  let content = '';
  
  if (input.rawText) {
    content += `TEXT CONTENT:\n${input.rawText}\n\n`;
  }
  
  if (input.rawHtml) {
    // Strip HTML for cleaner processing
    const cleanHtml = stripHtmlForLLM(input.rawHtml);
    content += `HTML CONTENT:\n${cleanHtml}\n\n`;
  }
  
  if (input.currentParse) {
    content += `PREVIOUS PARSE ATTEMPT:\n${JSON.stringify(input.currentParse, null, 2)}\n\n`;
  }
  
  return content.trim();
}

/**
 * Build system prompt for LLM
 */
function buildSystemPrompt(carrierHint?: string): string {
  const carrierSpecificGuidance = carrierHint ? getCarrierSpecificGuidance(carrierHint) : '';
  
  return `You are an expert at extracting flight ticket information from airline e-tickets and emails.

Extract ALL available flight information and return it as a JSON object. Focus on accuracy and completeness.
${carrierSpecificGuidance}

CRITICAL FIELDS (required for valid extraction):
- airlineLocator: Booking reference/confirmation code
- passengers: At least one passenger with full name  
- segments: At least one flight segment with valid flight number

EXTRACTION GUIDELINES:
- IMPORTANT: Extract PASSENGER names, NOT cardholder or payment method names
  * Look for passenger names in dedicated passenger sections or tables
  * Names often appear after "Passenger" labels or in passenger tables
  * Names may appear in parentheses after ticket numbers (e.g., "125-1234567890 (MR JOHN SMITH)")
  * Ignore names in payment sections, billing details, or after 'Cardholder:' labels
  * DO NOT extract names from 'Payment method', 'Billing address', or credit card sections
  * If you see "Dear Mr Smith" in greeting but "Passenger: Mr Jones" in booking details, extract "Jones"
- Remove titles like Mr/Mrs/Ms/Dr from passenger names
- Find flight numbers in format like BA123, AF456, LH789, etc.
- Extract dates in various formats and normalize to "DD MMM YYYY" format
- Extract times in 24-hour format (HH:MM)

DATE AND TIME HANDLING (CRITICAL):
- For overnight flights: If arrival time is earlier than departure time, the arrival is the NEXT DAY
  * Example: Depart 22:10 on 30 Aug → Arrive 06:15 = 31 Aug (next day)
  * Example: Depart 23:45 on 15 Jan → Arrive 05:30 = 16 Jan (next day)
- If only one date is shown for a flight segment, infer the arrival date using flight logic:
  * Flights departing after 20:00 and arriving before 10:00 typically arrive the next day
  * Most commercial flights are under 24 hours, so never add more than 1 day
  * When times suggest overnight travel, automatically increment the arrival date
- Time zone considerations: Focus on local times as shown in the ticket
- ALWAYS apply date logic: departure 22:00 + arrival 07:00 = arrival is next day

- Map cabin classes to standard values when possible
- Find booking references/confirmation codes (usually 6 alphanumeric characters)
- Extract baggage allowances for both checked and hand baggage separately
- Extract meal service information per flight segment
- Find IATA travel agency numbers
- Extract ticket validity dates
- Find payment amounts with currencies and fare breakdown details
- Look for any fare restrictions or endorsements

PASSENGER NAME EXTRACTION RULES:
- ✅ EXTRACT: Names in passenger tables, after "Passenger" labels, in parentheses after ticket numbers
- ✅ EXTRACT: Names in dedicated passenger sections (often in table format with | separators)
- ❌ DO NOT EXTRACT: Cardholder names, billing names, payment contact names
- ❌ AVOID: Names in payment, billing, credit card, or "Dear" greeting sections
- ✅ PRIORITY: If multiple names found, prioritize names from passenger sections over greeting names

JSON SCHEMA:
{
  "carrier": "string (airline code like BA, AF, LH)",
  "airlineLocator": "string (booking reference - CRITICAL)",
  "passengers": [
    {
      "fullName": "string (CRITICAL - at least one required)",
      "type": "ADT|CHD|INF (optional)"
    }
  ],
  "tickets": [
    {
      "number": "string",
      "paxName": "string",
      "validUntil": "string (optional - DD MMM YYYY format)"
    }
  ],
  "baggage": "string (checked baggage - e.g. '2 x 23kg')",
  "handBaggage": "string (hand/cabin baggage allowance)",
  "segments": [
    {
      "marketingFlightNo": "string (CRITICAL - e.g. BA123)",
      "cabin": "string (e.g. Economy, Business, First)",
      "bookingClass": "string (booking class code)",
      "mealService": "string (optional - Meal or Food and Beverages for Purchase)",
      "dep": {
        "iata": "string (airport code)",
        "city": "string",
        "terminal": "string",
        "timeLocal": "string (HH:MM format)",
        "date": "string (DD MMM YYYY format)"
      },
      "arr": {
        "iata": "string (airport code)", 
        "city": "string",
        "terminal": "string",
        "timeLocal": "string (HH:MM format)",
        "date": "string (DD MMM YYYY format)"
      }
    }
  ],
  "payments": [
    {
      "currency": "string",
      "total": number,
      "method": "string"
    }
  ],
  "fareDetails": {
    "baseFare": number,
    "currency": "string",
    "carrierCharges": number,
    "taxes": [
      {
        "type": "string (e.g. APD, ASC, PSC)",
        "amount": number,
        "description": "string (optional)"
      }
    ],
    "total": number
  },
  "fareNotes": "string",
  "iataNumber": "string (optional - travel agency IATA number)"
}

Return ONLY valid JSON matching this schema. Do not include explanatory text.`;
}

/**
 * Get carrier-specific extraction guidance
 */
function getCarrierSpecificGuidance(carrier: string): string {
  switch (carrier.toUpperCase()) {
    case 'BA':
      return `
CARRIER: British Airways (BA)
- Look for "Booking Reference:" followed by 6-character alphanumeric code
- PASSENGER NAMES: Extract from dedicated passenger sections, NOT payment details
  * Look for passenger tables with | separators: | Passenger | MR JOHN SMITH |
  * Names often in parentheses after ticket numbers: "125-1234567890 (MR JOHN SMITH)"
  * Found in booking confirmation sections, not billing/payment areas
  * IGNORE names in "Payment method", "Cardholder", "Dear" greetings, or billing sections
  * BA tickets show passenger name separately from cardholder name
- Flight numbers are in format "BA" + 3-4 digits (e.g., BA0078, BA1306)
- Cabin classes: "World Traveller" = Economy, "Euro Traveller" = Economy, "Club World" = Business
- OVERNIGHT FLIGHTS: BA often has overnight routes (e.g., BA0078 ACC-LHR departs 22:10, arrives 06:15 next day)
  * Apply date logic: late departure + early arrival = next day arrival
  * Common overnight routes: West Africa to London, some European routes
- Extract baggage separately: checked ("2 bags at 23kg") and hand baggage ("1 handbag/laptop bag, plus 1 additional cabin bag")
- Look for meal service per route: "Meal" for long-haul, "Food and Beverages for Purchase" for short-haul
- Extract IATA numbers from agency bookings
- Find ticket validity dates: "Ticket(s) Valid until DD MMM YYYY"
- Extract detailed fare breakdown including base fare, carrier charges, and individual taxes
- Terminal information often appears with flight details`;

    case 'AF':
      return `
CARRIER: Air France (AF)
- Flight numbers are in format "AF" + 3-4 digits
- Look for confirmation codes in Air France emails/tickets
- Cabin classes may include "Economy", "Premium Economy", "Business", "First"
- OVERNIGHT FLIGHTS: Common on long-haul routes (e.g., Africa-Europe, transatlantic)
  * Apply date logic for late departures with early arrivals
- Extract passenger names from booking sections, not payment details
- Look for baggage allowances and meal service information`;

    case 'LH':
      return `
CARRIER: Lufthansa (LH)
- Flight numbers are in format "LH" + 3-4 digits
- Look for confirmation codes in Lufthansa communications
- OVERNIGHT FLIGHTS: Common on intercontinental routes
  * Apply date logic for flights crossing time zones with overnight travel
- Extract passenger names from booking sections, not payment details
- Look for baggage allowances and meal service information`;

    case 'KL':
      return `
CARRIER: KLM (KL)
- Flight numbers are in format "KL" + 3-4 digits
- Look for booking references in KLM format
- Extract passenger names from booking sections, not payment details
- Look for baggage allowances and meal service information`;

    case 'VS':
      return `
CARRIER: Virgin Atlantic (VS)
- Flight numbers are in format "VS" + 3-4 digits
- Look for Virgin-specific booking formats
- Extract passenger names from booking sections, not payment details
- Look for baggage allowances and meal service information`;

    default:
      return `
CARRIER: ${carrier}
- Look for flight numbers starting with "${carrier}" followed by digits
- OVERNIGHT FLIGHTS: Apply date logic if departure is late evening and arrival is early morning
  * Assume arrival is next day when times suggest overnight travel
- Extract passenger names from booking sections, not payment details
- Look for baggage allowances and meal service information`;
  }
}

/**
 * Strip HTML tags and clean for LLM processing
 */
function stripHtmlForLLM(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove styles
    .replace(/<[^>]*>/g, ' ') // Remove all HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&amp;/g, '&') // Decode &amp;
    .replace(/&lt;/g, '<') // Decode &lt;
    .replace(/&gt;/g, '>') // Decode &gt;
    .replace(/&quot;/g, '"') // Decode &quot;
    .replace(/&#39;/g, "'") // Decode &#39;
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}