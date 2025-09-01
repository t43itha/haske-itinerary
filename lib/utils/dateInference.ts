import { ParsedTicket } from '../types';

export interface DateTimeInfo {
  date?: string;
  time?: string;
  parsedDateTime?: Date;
  isInferred?: boolean;
  confidence: 'high' | 'medium' | 'low';
}

export interface InferredSegment {
  marketingFlightNo: string;
  dep: DateTimeInfo;
  arr: DateTimeInfo;
}

/**
 * Infer missing dates for multi-segment flights with layovers
 * Only applies inference when dates are truly missing, preserves existing dates
 */
export function inferSegmentDates(segments: ParsedTicket['segments']): ParsedTicket['segments'] {
  if (segments.length === 0) return segments;
  
  console.log('Starting conservative date inference for', segments.length, 'segments');
  
  // First pass: Parse all available dates and times, but preserve original strings
  const inferredSegments = segments.map((segment, index) => {
    const depDateTime = parseDateTime(segment.dep.date, segment.dep.timeLocal);
    const arrDateTime = parseDateTime(segment.arr.date, segment.arr.timeLocal);
    
    return {
      ...segment,
      dep: {
        ...segment.dep,
        parsedDateTime: depDateTime.parsedDateTime,
        isInferred: depDateTime.isInferred,
        confidence: depDateTime.confidence
      },
      arr: {
        ...segment.arr,
        parsedDateTime: arrDateTime.parsedDateTime,
        isInferred: arrDateTime.isInferred,
        confidence: arrDateTime.confidence
      }
    };
  });

  // Second pass: Only infer missing dates, don't modify existing ones
  const processedSegments = inferOnlyMissingDates(inferredSegments);
  
  // Third pass: Format back to string format, preserving original strings when possible
  return processedSegments.map(segment => {
    // Preserve original date/time strings if they were provided and parsed successfully
    const depDate = segment.dep.date && segment.dep.confidence === 'high' ? 
      segment.dep.date : 
      (segment.dep.parsedDateTime ? formatDate(segment.dep.parsedDateTime) : segment.dep.date);
      
    const depTime = segment.dep.timeLocal && segment.dep.confidence === 'high' ? 
      segment.dep.timeLocal : 
      (segment.dep.parsedDateTime ? formatTime(segment.dep.parsedDateTime) : segment.dep.timeLocal);
      
    const arrDate = segment.arr.date && segment.arr.confidence === 'high' ? 
      segment.arr.date : 
      (segment.arr.parsedDateTime ? formatDate(segment.arr.parsedDateTime) : segment.arr.date);
      
    const arrTime = segment.arr.timeLocal && segment.arr.confidence === 'high' ? 
      segment.arr.timeLocal : 
      (segment.arr.parsedDateTime ? formatTime(segment.arr.parsedDateTime) : segment.arr.timeLocal);
    
    // Remove internal properties and return clean segment
    const { parsedDateTime: depParsed, isInferred: depInferred, confidence: depConf, ...depRest } = segment.dep;
    const { parsedDateTime: arrParsed, isInferred: arrInferred, confidence: arrConf, ...arrRest } = segment.arr;
    
    return {
      ...segment,
      dep: {
        ...depRest,
        date: depDate,
        timeLocal: depTime
      },
      arr: {
        ...arrRest,
        date: arrDate,
        timeLocal: arrTime
      }
    };
  });
}

/**
 * Parse date and time strings into Date objects with confidence scoring
 */
function parseDateTime(dateStr?: string, timeStr?: string): DateTimeInfo {
  const result: DateTimeInfo = {
    date: dateStr,
    time: timeStr,
    isInferred: false,
    confidence: 'low'
  };

  if (!dateStr && !timeStr) {
    return result;
  }

  try {
    let parsedDate: Date | null = null;
    
    if (dateStr && timeStr) {
      // Both date and time provided
      const normalizedDate = normalizeDateString(dateStr);
      const normalizedTime = normalizeTimeString(timeStr);
      
      if (normalizedDate && normalizedTime) {
        parsedDate = new Date(`${normalizedDate}T${normalizedTime}:00.000Z`);
        result.confidence = 'high';
      }
    } else if (dateStr) {
      // Only date provided
      const normalizedDate = normalizeDateString(dateStr);
      if (normalizedDate) {
        parsedDate = new Date(`${normalizedDate}T00:00:00.000Z`);
        result.confidence = 'medium';
      }
    } else if (timeStr) {
      // Only time provided - leave parsedDate as null, will be handled in inference step
      result.confidence = 'low';
    }

    if (parsedDate && !isNaN(parsedDate.getTime())) {
      result.parsedDateTime = parsedDate;
      result.confidence = result.confidence === 'low' ? 'medium' : result.confidence;
    }
  } catch (error) {
    console.warn('Failed to parse date/time:', { dateStr, timeStr }, error);
  }

  return result;
}

/**
 * Only infer dates when truly missing, don't modify existing dates
 * Apply intelligent date inference for multi-segment flights
 */
function inferOnlyMissingDates(segments: any[]): any[] {
  const result = [...segments];
  
  console.log('Smart date inference for multi-segment flights');
  
  // First pass: Log what we have
  result.forEach((segment, i) => {
    console.log(`Segment ${i + 1} (${segment.marketingFlightNo}):`, {
      depDate: segment.dep.date,
      depTime: segment.dep.timeLocal,
      arrDate: segment.arr.date, 
      arrTime: segment.arr.timeLocal
    });
  });
  
  for (let i = 0; i < result.length; i++) {
    const segment = result[i];
    const prevSegment = i > 0 ? result[i - 1] : null;
    
    // Only infer arrival date if it's missing AND we have departure date and arrival time
    if (!segment.arr.date && !segment.arr.parsedDateTime && 
        segment.dep.parsedDateTime && segment.arr.timeLocal) {
      
      const arrTimeStr = normalizeTimeString(segment.arr.timeLocal);
      const depTimeStr = normalizeTimeString(segment.dep.timeLocal);
      
      if (arrTimeStr && depTimeStr) {
        // Extract hours for comparison (handle both HH:MM and HHMM formats)
        const arrHour = parseInt(arrTimeStr.replace(':', '').substring(0, 2));
        const depHour = parseInt(depTimeStr.replace(':', '').substring(0, 2));
        
        let arrDate = new Date(segment.dep.parsedDateTime);
        const [hours, minutes] = arrTimeStr.split(':').map(Number);
        arrDate.setUTCHours(hours, minutes, 0, 0);
        
        // Smart overnight detection: only if arrival is much earlier than departure
        // AND it makes sense for the flight duration
        if (arrHour < depHour - 12) {
          // Very early arrival compared to late departure = likely overnight
          arrDate.setDate(arrDate.getDate() + 1);
          console.log(`Inferred overnight arrival for ${segment.marketingFlightNo}: dep ${depTimeStr} → arr ${arrTimeStr} (+1)`);
        } else {
          console.log(`Inferred same-day arrival for ${segment.marketingFlightNo}: dep ${depTimeStr} → arr ${arrTimeStr}`);
        }
        
        segment.arr.parsedDateTime = arrDate;
        segment.arr.isInferred = true;
        segment.arr.confidence = 'medium';
      }
    }
    
    // For multi-segment: infer departure date based on previous segment's arrival
    if (!segment.dep.date && !segment.dep.parsedDateTime && segment.dep.timeLocal && prevSegment?.arr.parsedDateTime) {
      const depTimeStr = normalizeTimeString(segment.dep.timeLocal);
      if (depTimeStr) {
        // Start from previous arrival date
        let depDate = new Date(prevSegment.arr.parsedDateTime);
        const [hours, minutes] = depTimeStr.split(':').map(Number);
        
        // Check if departure time is before previous arrival time (suggests next day)
        const prevArrHour = prevSegment.arr.parsedDateTime.getUTCHours();
        if (hours < prevArrHour - 2) { // Allow 2-hour buffer for connections
          depDate.setDate(depDate.getDate() + 1);
          console.log(`Inferred next-day departure for ${segment.marketingFlightNo} after overnight layover`);
        }
        
        depDate.setUTCHours(hours, minutes, 0, 0);
        
        segment.dep.parsedDateTime = depDate;
        segment.dep.isInferred = true;
        segment.dep.confidence = 'medium';
        
        console.log(`Inferred departure for ${segment.marketingFlightNo} based on previous arrival: ${formatDate(depDate)} ${depTimeStr}`);
      }
    }
    
    // Fallback: if no context, use current date
    if (!segment.dep.date && !segment.dep.parsedDateTime && segment.dep.timeLocal && !prevSegment) {
      const timeStr = normalizeTimeString(segment.dep.timeLocal);
      if (timeStr) {
        const currentDate = new Date();
        const [hours, minutes] = timeStr.split(':').map(Number);
        currentDate.setUTCHours(hours, minutes, 0, 0);
        
        segment.dep.parsedDateTime = currentDate;
        segment.dep.isInferred = true;
        segment.dep.confidence = 'low';
        
        console.log(`Using current date for ${segment.marketingFlightNo} (no context): ${formatDate(currentDate)}`);
      }
    }
  }

  return result;
}

/**
 * Normalize date string to ISO format (YYYY-MM-DD)
 */
function normalizeDateString(dateStr: string): string | null {
  const cleanDate = dateStr.trim();
  
  // Already in ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    return cleanDate;
  }
  
  // DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = cleanDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, part1, part2, year] = slashMatch;
    const day = part1.padStart(2, '0');
    const month = part2.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // DD MMM YYYY format
  const monthNames: Record<string, string> = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };
  
  const monthMatch = cleanDate.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/i);
  if (monthMatch) {
    const [, day, monthName, year] = monthMatch;
    const monthNum = monthNames[monthName.toLowerCase()];
    if (monthNum) {
      return `${year}-${monthNum}-${day.padStart(2, '0')}`;
    }
  }
  
  // Try parsing as Date
  try {
    const parsed = new Date(cleanDate);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  } catch {
    // Ignore parsing errors
  }
  
  return null;
}

/**
 * Normalize time string to HH:MM format (or preserve HHMM if that's the input)
 */
function normalizeTimeString(timeStr: string): string | null {
  const cleanTime = timeStr.trim();
  
  // Military time format HHMM (e.g., "2030", "0425")
  if (/^\d{4}$/.test(cleanTime)) {
    const hours = cleanTime.substring(0, 2);
    const minutes = cleanTime.substring(2, 4);
    // Validate it's a valid time
    const h = parseInt(hours);
    const m = parseInt(minutes);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      // Convert to HH:MM for internal processing but preserve original in segment
      return `${hours}:${minutes}`;
    }
  }
  
  // 24-hour format with colon (e.g., "20:30", "4:25")
  if (/^\d{1,2}:\d{2}$/.test(cleanTime)) {
    const [hours, minutes] = cleanTime.split(':');
    return `${hours.padStart(2, '0')}:${minutes}`;
  }
  
  // 12-hour format (e.g., "10:30 PM")
  const ampmMatch = cleanTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    const [, hoursStr, minutes, period] = ampmMatch;
    let hours = parseInt(hoursStr, 10);
    
    if (period.toUpperCase() === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period.toUpperCase() === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
  
  console.warn(`Unable to normalize time string: "${cleanTime}"`);
  return null;
}

/**
 * Format Date to DD MMM YYYY string
 */
function formatDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  
  return `${day} ${month} ${year}`;
}

/**
 * Format Date to HH:MM string
 */
function formatTime(date: Date): string {
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Validate that segments are chronologically consistent
 * Provides warnings but doesn't fail extraction for minor issues
 */
export function validateSegmentDates(segments: ParsedTicket['segments']): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const prevSegment = i > 0 ? segments[i - 1] : null;
    
    // Check if departure is before arrival within segment
    if (segment.dep.date && segment.dep.timeLocal && 
        segment.arr.date && segment.arr.timeLocal) {
      const depDateTime = parseDateTime(segment.dep.date, segment.dep.timeLocal);
      const arrDateTime = parseDateTime(segment.arr.date, segment.arr.timeLocal);
      
      if (depDateTime.parsedDateTime && arrDateTime.parsedDateTime) {
        if (depDateTime.parsedDateTime >= arrDateTime.parsedDateTime) {
          // This is a serious error that should be flagged
          errors.push(`Segment ${i + 1} (${segment.marketingFlightNo}): departure ${segment.dep.date} ${segment.dep.timeLocal} is not before arrival ${segment.arr.date} ${segment.arr.timeLocal}`);
        }
      } else {
        // Missing or unparseable dates are warnings, not errors
        warnings.push(`Segment ${i + 1} (${segment.marketingFlightNo}): Could not parse dates for validation`);
      }
    } else {
      warnings.push(`Segment ${i + 1} (${segment.marketingFlightNo}): Missing date/time information for validation`);
    }
    
    // Check if current departure is after previous arrival (with reasonable layover time)
    if (prevSegment && prevSegment.arr.date && prevSegment.arr.timeLocal &&
        segment.dep.date && segment.dep.timeLocal) {
      const prevArrDateTime = parseDateTime(prevSegment.arr.date, prevSegment.arr.timeLocal);
      const currDepDateTime = parseDateTime(segment.dep.date, segment.dep.timeLocal);
      
      if (prevArrDateTime.parsedDateTime && currDepDateTime.parsedDateTime) {
        const layoverTime = currDepDateTime.parsedDateTime.getTime() - prevArrDateTime.parsedDateTime.getTime();
        const layoverMinutes = layoverTime / (1000 * 60);
        
        if (layoverMinutes < 0) {
          errors.push(`Segment ${i + 1} (${segment.marketingFlightNo}): departure ${segment.dep.date} ${segment.dep.timeLocal} is before previous arrival ${prevSegment.arr.date} ${prevSegment.arr.timeLocal}`);
        } else if (layoverMinutes < 30) {
          warnings.push(`Segment ${i + 1} (${segment.marketingFlightNo}): Very short layover of ${Math.round(layoverMinutes)} minutes`);
        }
      }
    }
  }
  
  // Log warnings separately
  if (warnings.length > 0) {
    console.warn('Date validation warnings:', warnings);
  }
  
  return {
    isValid: errors.length === 0, // Only fail for serious errors, not warnings
    errors
  };
}