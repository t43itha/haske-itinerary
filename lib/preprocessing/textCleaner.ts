/**
 * Text preprocessing module for cleaning PDF text before extraction
 * Based on deterministic extraction strategy to reduce LLM errors
 */

/**
 * Pre-clean PDF text for better extraction
 */
export function preprocessPDFText(rawText: string): string {
  let cleaned = rawText;
  
  // 1. Strip icons/glyphs that might interfere
  cleaned = cleaned.replace(/[✈️🛫🛬]/g, '');
  cleaned = cleaned.replace(/[\u2708\u2709\u2713\u2714]/g, ''); // Common PDF icons
  
  // 2. Dehyphenate and collapse - join word wraps
  cleaned = cleaned.replace(/(\w+)-\n(\w+)/g, '$1$2'); // Join hyphenated words across lines
  cleaned = cleaned.replace(/\s+/g, ' '); // Collapse multiple spaces
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Limit multiple newlines
  
  // 3. CRITICAL: Split glued IATAs (e.g., "CPTJNB" → "CPT JNB")
  // This is present in the SANEW.pdf: "08:20 CPTJNB"
  cleaned = cleaned.replace(/\b([A-Z]{3})(?=[A-Z]{3})\b/g, '$1 ');
  
  // 4. Normalize times to consistent format
  cleaned = normalizeTimeFormats(cleaned);
  
  // 5. Mark +1 day indicators
  cleaned = markNextDayArrivals(cleaned);
  
  // 6. Fix common PDF extraction issues
  cleaned = cleaned.replace(/\bl\s+h\s+r\b/gi, 'LHR'); // Fix broken airport codes
  cleaned = cleaned.replace(/\bj\s+n\s+b\b/gi, 'JNB');
  cleaned = cleaned.replace(/\bc\s+p\s+t\b/gi, 'CPT');
  cleaned = cleaned.replace(/\ba\s+c\s+c\b/gi, 'ACC');
  
  return cleaned;
}

/**
 * Normalize various time formats to HH:MM
 */
function normalizeTimeFormats(text: string): string {
  // Convert HHMM to HH:MM (e.g., "2030" → "20:30")
  text = text.replace(/\b(\d{2})(\d{2})\b/g, (match, h, m) => {
    const hour = parseInt(h);
    const min = parseInt(m);
    if (hour >= 0 && hour <= 23 && min >= 0 && min <= 59) {
      return `${h}:${m}`;
    }
    return match; // Not a time, return as-is
  });
  
  // Ensure all times have leading zeros (e.g., "4:25" → "04:25")
  text = text.replace(/\b(\d):(\d{2})\b/g, '0$1:$2');
  
  return text;
}

/**
 * Mark +1 day indicators near arrival times
 */
function markNextDayArrivals(text: string): string {
  // Look for patterns like "(+1 day)" or "+1" near times
  text = text.replace(/(\d{2}:\d{2})\s*(?:\([+]\d+\s*days?\)|[+]\d+\s*days?|\([+]\d+\)|[+]\d+)/gi, '$1 NEXT_DAY');
  
  return text;
}

/**
 * Extract city to IATA mapping from itinerary text
 */
export function buildCityIATAMap(text: string): Map<string, string> {
  const map = new Map<string, string>();
  
  // Pattern: City name ... (IATA)
  // e.g., "Accra ... (ACC)", "Johannesburg ... (JNB)"
  const cityIataPattern = /([A-Za-z][A-Za-z\s.'-]+?)\s*(?:\.{2,}|\s+)\(([A-Z]{3})\)/g;
  
  let match;
  while ((match = cityIataPattern.exec(text)) !== null) {
    const city = match[1].trim();
    const iata = match[2];
    map.set(city.toLowerCase(), iata);
    map.set(iata, iata); // Also map IATA to itself
    console.log(`Mapped: ${city} → ${iata}`);
  }
  
  // Add common mappings that might be missed
  const commonMappings = {
    'accra': 'ACC',
    'johannesburg': 'JNB',
    'joburg': 'JNB',
    'cape town': 'CPT',
    'london': 'LHR',
    'heathrow': 'LHR'
  };
  
  for (const [city, iata] of Object.entries(commonMappings)) {
    if (!map.has(city)) {
      map.set(city, iata);
    }
  }
  
  return map;
}

/**
 * Extract terminal information for each airport
 */
export function extractTerminals(text: string): Map<string, string> {
  const terminals = new Map<string, string>();
  
  // Pattern: IATA or City followed by Terminal X
  const terminalPattern = /\b([A-Z]{3}|[A-Za-z\s]+?)\s*(?:Terminal|Term\.?)\s*([A-Z0-9]+)/gi;
  
  let match;
  while ((match = terminalPattern.exec(text)) !== null) {
    const location = match[1].trim();
    const terminal = match[2];
    terminals.set(location, terminal);
  }
  
  return terminals;
}

/**
 * Extract all time+location waypoints in chronological order
 */
export interface Waypoint {
  time: string;      // HH:MM format
  location: string;  // IATA code
  isNextDay?: boolean;
  terminal?: string;
  contextIndex: number; // Position in text for ordering
}

export function extractWaypoints(text: string, cityIataMap: Map<string, string>): Waypoint[] {
  const waypoints: Waypoint[] = [];
  const seenWaypoints = new Set<string>(); // To avoid duplicates
  
  // Focus on "Itinerary details" section which has clean format
  // Pattern: "20:30 Accra\nKotoka International (ACC)"
  const itineraryStart = text.indexOf('Itinerary details');
  if (itineraryStart === -1) {
    console.warn('No "Itinerary details" section found, using full text');
  } else {
    console.log('Found "Itinerary details" at position:', itineraryStart);
  }
  
  // Extract from itinerary section if found, otherwise use full text
  const searchText = itineraryStart !== -1 
    ? text.substring(itineraryStart) 
    : text;
  
  console.log('Searching for waypoints in text of length:', searchText.length);
  
  const lines = searchText.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and specific headers (but not all lines)
    if (!line || line === 'Itinerary details' || line === 'Your fare') {
      continue;
    }
    
    // Look for time patterns - make it more flexible
    const timeMatch = line.match(/^(\d{1,2}:\d{2})\s*(.*)$/);
    
    if (timeMatch) {
      const time = timeMatch[1];
      const afterTime = timeMatch[2] ? timeMatch[2].trim() : '';
      console.log(`Line ${i}: Found time ${time} with text: "${afterTime}"`);
      
      // The city name is on the same line as the time
      let city = afterTime;
      let location = '';
      
      // Look for IATA code in parentheses on the NEXT line
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        console.log(`  Checking next line for IATA: "${nextLine}"`);
        const iataMatch = nextLine.match(/\(([A-Z]{3})\)/);
        if (iataMatch) {
          location = iataMatch[1];
          console.log(`  Found IATA in parentheses: ${location}`);
        }
      }
      
      // If no IATA found, try to map the city name
      if (!location && city) {
        // Clean city name
        const cleanCity = city.replace(/[^A-Za-z\s]/g, '').trim().toLowerCase();
        
        // Direct city mapping
        const directMap: Record<string, string> = {
          'accra': 'ACC',
          'johannesburg': 'JNB',
          'cape town': 'CPT',
          'london': 'LHR',
          'paris': 'CDG',
          'frankfurt': 'FRA',
          'amsterdam': 'AMS'
        };
        
        location = directMap[cleanCity] || '';
        
        // Try city-IATA map if still not found
        if (!location) {
          const cities = Array.from(cityIataMap.keys());
          for (const mapCity of cities) {
            if (cleanCity.includes(mapCity.toLowerCase()) || 
                mapCity.toLowerCase().includes(cleanCity)) {
              location = cityIataMap.get(mapCity)!;
              break;
            }
          }
        }
      }
      
      if (location) {
        // Create unique key to avoid duplicates
        const waypointKey = `${time}-${location}`;
        
        if (!seenWaypoints.has(waypointKey)) {
          seenWaypoints.add(waypointKey);
          
          // Check for next day indicator
          const surroundingText = lines.slice(Math.max(0, i - 1), Math.min(i + 3, lines.length)).join(' ');
          const isNextDay = surroundingText.includes('+1 day') ||
                            surroundingText.includes('(+1 day)') ||
                            surroundingText.includes('+1');
          
          // Extract terminal if present
          const terminalMatch = surroundingText.match(/Terminal\s*([A-Z0-9]+)/i);
          const terminal = terminalMatch ? terminalMatch[1] : undefined;
          
          waypoints.push({
            time,
            location,
            isNextDay,
            terminal,
            contextIndex: i
          });
          
          console.log(`Found waypoint: ${time} ${location}${isNextDay ? ' (+1)' : ''}${terminal ? ` Terminal ${terminal}` : ''}`);
        }
      } else {
        console.log(`  WARNING: Could not find IATA for time ${time} with city "${city}"`);
      }
    }
  }
  
  // Sort by context position to maintain chronological order
  waypoints.sort((a, b) => a.contextIndex - b.contextIndex);
  
  return waypoints;
}

/**
 * Extract flight numbers in order of appearance
 */
export function extractFlightNumbers(text: string): string[] {
  const flightNumbers: string[] = [];
  
  // Focus on actual flight numbers, not random letter-digit combinations
  // Pattern: "Flight number SA 053" or similar
  const flightPattern = /Flight\s+number\s+([A-Z]{2})\s?(\d{3,4})/gi;
  
  let match;
  while ((match = flightPattern.exec(text)) !== null) {
    const flightNo = `${match[1]}${match[2]}`;
    if (!flightNumbers.includes(flightNo)) {
      flightNumbers.push(flightNo);
      console.log(`Found flight number: ${flightNo}`);
    }
  }
  
  // If no explicit "Flight number" patterns found, try common airline codes
  if (flightNumbers.length === 0) {
    const airlinePattern = /\b(SA|BA|AF|KL|LH|VS|AA|DL|UA|EK|QR|SQ|CX)\s?(\d{3,4})\b/g;
    let airlineMatch;
    while ((airlineMatch = airlinePattern.exec(text)) !== null) {
      const flightNo = `${airlineMatch[1]}${airlineMatch[2]}`;
      if (!flightNumbers.includes(flightNo)) {
        flightNumbers.push(flightNo);
        console.log(`Found flight number: ${flightNo}`);
      }
    }
  }
  
  return flightNumbers;
}

/**
 * Extract flight durations near flight numbers
 */
export function extractDurations(text: string): Map<string, string> {
  const durations = new Map<string, string>();
  
  // Find flight numbers and nearby durations
  const flightPattern = /([A-Z]{2})\s?(\d{2,4})/g;
  
  let match;
  while ((match = flightPattern.exec(text)) !== null) {
    const flightNo = `${match[1]}${match[2]}`;
    const contextStart = Math.max(0, match.index - 100);
    const contextEnd = Math.min(text.length, match.index + 100);
    const context = text.substring(contextStart, contextEnd);
    
    // Look for duration pattern
    const durationMatch = context.match(/(\d+)h\s*(\d{1,2})min/);
    if (durationMatch) {
      const duration = `${durationMatch[1]}h ${durationMatch[2]}min`;
      durations.set(flightNo, duration);
      console.log(`Flight ${flightNo} duration: ${duration}`);
    }
  }
  
  return durations;
}