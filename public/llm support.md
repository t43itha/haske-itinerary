LLM Support

Here’s a concrete fix that makes 8B models behave—by doing deterministic pairing first, then letting the LLM only fill gaps.

1) Pre-clean the source (crucial)

Run these normalizations before any extraction/LLM:

Strip icons/labels: remove glyphs like  etc.

Dehyphenate & collapse: join word-\nwrap and collapse multi-spaces.

Split glued IATAs: insert spaces where two all-caps 3-letter IATAs touch:

Regex: ([A-Z]{3})(?=[A-Z]{3}) → $1 , so CPTJNB → CPT JNB. (Seen in your file: 08:20 CPTJNB.) 

Normalize times/durations: unify time to HH:mm, duration to (\d+)h (\d{1,2})min.

Mark +1 day: keep a ARR_PLUS_ONE=true flag if text near arrival contains +1 day or ( +1 day ). Your file uses (+1 day) by the Johannesburg arrival. 

2) Build a city↔IATA map first (from the “Itinerary details”)

Your SAA page lists each stop like:

Accra … (ACC) then later Johannesburg … (JNB) with terminals on separate lines. Parse these lines first to create a lookup:

Accra -> ACC (Terminal 3)
Johannesburg -> JNB (Terminal A/B)
Cape Town -> CPT


Then you can safely associate nearby times to known IATAs/cities even if columns collided. (All present in your PDF.) 

3) Segmentization strategy (deterministic)

Multi-segment itineraries often show:

A direction header (e.g., Accra to Cape Town – Sun, 28 Sep 2025) with overall duration and cabin,

Then per-leg durations and flight numbers lower down (Flight number SA 053 then SA 303),

Times + airports appear in an “Itinerary details” block.

Use this 3-pass algorithm:

Pass A — identify legs by flight numbers (order):
Find all Flight number [A-Z]{2}\s?\d{2,4} in order → create leg stubs L1, L2, … with marketing flight numbers SA 053, SA 303, etc. (Both appear in your file.) 

Pass B — collect chronological time+IATA pairs:
Grab every time token \b([01]?\d|2[0-3]):[0-5]\d\b and the nearest IATA (using the city↔IATA map and the cleaned CPT JNB tokens). From your sample outbound:

20:30 ACC
04:25 JNB (+1 day, Terminal A)
06:05 JNB (Terminal B)
08:20 CPT


This yields 4 ordered waypoints → 2 legs. 

Pass C — stitch waypoints into legs:

Pair (0→1) as Leg 1 dep/arr, (2→3) as Leg 2 dep/arr.

Attach per-leg durations from nearby “5h 55min”, “2h 15min” lines, by nearest neighbor search around each Flight number … block. (Your PDF shows 5h 55min near SA 053 and 2h 15min near SA 303.) 

Terminals: map the terminal that appears next to each city line (“Terminal A/B/3”) to the corresponding dep/arr of the leg.

Do the same for the return direction (CPT → JNB → ACC) where SAA shows 19:35 CPT, 21:35 JNB, 14:55 JNB, 19:00 ACC and marks a long connection (“17h 20min 1 stop … Terminal change”). 

4) Only then call the LLM (to tidy, not to discover)

Give the model one leg at a time with a tiny prompt to normalize fields (don’t let it “find” times):

Input JSON you produce:

{
  "marketingFlightNo":"SA 053",
  "dep":{"iata":"ACC","dateLocal":"2025-09-28","timeLocal":"20:30","terminal":"3"},
  "arr":{"iata":"JNB","dateLocal":"2025-09-29","timeLocal":"04:25","terminal":"A","+1day":true},
  "durationText":"5h 55min"
}


Ask it only to:

parse durationText → durationMinutes,

map missing cabin/bookingClass from nearby strings (e.g., “Business”),

ensure ISO YYYY-MM-DDTHH:mm if you like.
Temperature 0, JSON-only, fail if any input key missing.

5) Concrete regex/snippets you can drop in

Glued IATAs fix

const fixGluedIATAs = (s:string) => s.replace(/([A-Z]{3})(?=[A-Z]{3})/g, '$1 ');


Time tokens near IATA/city

const TIME = /\b([01]?\d|2[0-3]):[0-5]\d\b/;
const IATA = /\b[A-Z]{3}\b/;


City/IATA mapping from “(XXX)”

const CITY_IATA = /([A-Za-z .'-]+)\s*\((([A-Z]{3}))\)/g;
// Accra ... (ACC), Johannesburg ... (JNB), Cape Town ... (CPT)


Leg stitching (sketch)

type Waypoint = { time:"HH:mm"; iata:string; plusOne?:boolean; terminal?:string; contextIdx:number };
const waypoints = extractWaypoints(cleanText, cityIataMap); // in order
const legs = [];
for (let i=0; i+1<waypoints.length; i+=2) {
  legs.push({ dep:waypoints[i], arr:waypoints[i+1] });
}
// Attach flight numbers in order of appearance:
const flights = [...cleanText.matchAll(/Flight number\s+([A-Z]{2})\s?(\d{2,4})/g)];
legs.forEach((leg, idx) => leg.flightNo = `${flights[idx][1]} ${flights[idx][2]}`);
// Attach durations near each flight block similarly.


+1 day detection
Look within ±50 chars of the arrival city line for +1 day or (+1 day) and set arr.plusOne=true. Present in your JNB arrival. 

6) Guardrails that stop common failures

Require an even count of time+IATA waypoints per direction; if odd, re-run preprocessing (most often due to glued IATAs).

Validate flight numbers shape per leg; if count of legs ≠ count of flight numbers, fall back to the “Itinerary details” order rather than the scattered headers.

If a terminal is shown twice for the same airport (JNB Terminal A then Terminal B), that implies a connection—do not assign both to the same leg.

7) Cross-check with enrichment (optional but powerful)

After stitching, call your flight-status provider for each leg (SA 053 on 2025-09-28, SA 303 on 2025-09-29, etc.) and verify:

route matches ACC→JNB, JNB→CPT,

scheduled times within ±15 minutes (timezones!).
If off, prefer the ticket times for the PDF but flag for review.