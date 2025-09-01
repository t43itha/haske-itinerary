👉 “Codex/Claude, add e-ticket ingestion to Haske Flights v1”

You are an expert Next.js 14 + Convex engineer. Extend the app to ingest airline e-tickets (PDF or email/HTML) and auto-populate itineraries.

0) Scope

Inputs: PDF upload, .eml/.html upload, or pasted HTML.

Airlines: start with British Airways patterns; make the parser pluggable so we can add more carriers later.

Preserve existing manual form; show a “Review & apply” screen before save.

1) Data contracts

Add in lib/types.ts:

export type ParsedTicket = {
  carrier: string;                       // "BA"
  airlineLocator?: string;               // "ZL75AO"
  passengers: Array<{ fullName: string; type?: "ADT"|"CHD"|"INF" }>;
  tickets?: Array<{ number: string; paxName: string }>; // "125-2214424598"
  baggage?: string;                      // "2 bags at 23kg"
  segments: Array<{
    marketingFlightNo: string;           // "BA0078"
    cabin?: string;                      // "World Traveller" => "ECONOMY"
    bookingClass?: string;               // if present
    dep: { iata?: string; city?: string; terminal?: string; timeLocal?: string; date?: string };
    arr: { iata?: string; city?: string; terminal?: string; timeLocal?: string; date?: string };
  }>;
  payments?: { currency: string; total: number; method?: string }[];
  fareNotes?: string;                    // endorsements/penalties text
  raw: { text?: string; html?: string }; // for audit
}

2) Upload & text extraction

New route app/(app)/ingest/page.tsx with file dropzone (PDF/EML/HTML) and textarea (paste HTML).

Add server util lib/extractText.ts:

PDFs: use pdf-parse (or pdfjs-dist) to plain text.

EML/HTML: parse with mailparser and sanitize HTML; keep both raw text and DOM.

Return { text, html }.

3) Pluggable parser pipeline

Create parsers/index.ts:

export async function parseTicket(input: {text?: string; html?: string}): Promise<ParsedTicket> {
  if (looksLikeBA(input)) return parseBA(input);
  // add more carriers here (AF/KL/LH/VS etc.)
  return parseGeneric(input); // LLM-backed fallback
}

3a) BA deterministic parser (parsers/ba.ts)

Implement robust regex + small DOM queries (if HTML). Map fields BA uses:

Booking reference: Booking reference:\s*([A-Z0-9]{6}) → airlineLocator.
(Seen in your BA email: “Booking reference: ZL75AO”.) 

Passenger(s): lines beginning Passenger or in ticket section, capture uppercase name.
(Example: “Passenger MR JOSEPH ABBAN”.) 

Ticket number: \b(125-\d{10})\b under “Ticket Number(s)”. 

Segments: blocks like:

BA0078
British Airways | World Traveller | Confirmed

30 Aug 2025
22:10
Accra
Terminal 3

31 Aug 2025
06:15
Heathrow (London)
Terminal 5


Extract:

marketingFlightNo: BA\d{3,4}

cabin: first pipe-separated token after carrier (World Traveller → map to ECONOMY; Euro Traveller → ECONOMY; Club World → BUSINESS; First → FIRST). 

dep.date/time/terminal/city, arr.date/time/terminal/city

Baggage: detect the allowance table and normalize to a simple string, e.g., “2 x 23kg”. BA shows “2 bags at 23kg (51lbs)”. 

Payments: capture total (Payment Total USD 2230.00) and method (Visa Corporate). 

Fare notes/endorsements: e.g., “Endorsements Pax carrier restriction apply penalty applies”. 

3b) Generic fallback (parsers/generic.ts)

Use an LLM extraction (OpenAI JSON schema) to fill ParsedTicket, seeded with airline lexicon and date patterns.

Post-process with rules (flight number shape, 24h time, IATA city names).

The deterministic BA parser must succeed without the LLM when possible.

4) Normalization → app schema

Convert ParsedTicket → BookingExtras + segments updates:

refs.airline = airlineLocator

baggage, fareNotes

For each segment: set cabin, maybe bookingClass (if found); keep dep/arr terminals.

If you already call flight enrichment, keep that call; your parser provides dates/times/terminals from the ticket, enrichment can add gates/aircraft/duration/status.

5) Review & apply UI

After parse, show a diff against the current itinerary (left = current, right = parsed).

Allow checkboxes per field (apply or ignore).

“Apply to itinerary” writes to Convex and re-renders PDF.

6) BA cabin mapping helper
const BA_CABIN_MAP: Record<string,string> = {
  "World Traveller":"ECONOMY",
  "Euro Traveller":"ECONOMY",
  "World Traveller Plus":"PREMIUM_ECONOMY",
  "Club Europe":"BUSINESS",
  "Club World":"BUSINESS",
  "First":"FIRST"
};

7) SSR codes (optional for v1.1)

Provide manual SSR entry as today; if ticket text includes common SSR tokens, surface suggestions (don’t auto-apply).

8) Tests

Fixture text from the provided BA email PDF; unit tests for:

reference, ticket number, segments (multi-segment, +1 day arrivals), baggage, payments.

Make the parser resilient to line breaks and spacing.

Acceptance criteria

I can upload a BA e-ticket email/PDF and see the app extract: airline locator, passenger(s), 3–4 segments with dates/times/cities/terminals, cabin names, baggage, ticket number, payment total. 

I can review and apply the parsed data; the itinerary page + PDF update accordingly.

If parsing fails, I still see an LLM-assisted suggestion that I can edit.

Framework to add more carriers exists (parsers/<carrier>.ts plus looksLikeX() guards).