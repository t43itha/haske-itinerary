/**
 * Military time formatting utilities that preserve the exact format from PDFs
 * Handles formats like "2030", "20:30", and adds next-day indicators
 */

export interface FlightTimeInfo {
  departureTime: string;
  departureDate?: string;
  arrivalTime: string;
  arrivalDate?: string;
  departureCode: string;
  arrivalCode: string;
}

/**
 * Format time to military format (HHMM) without colons
 * Preserves original format from PDF extraction
 */
export function formatToMilitaryTime(timeStr: string): string {
  if (!timeStr) return '';
  
  // If already in HHMM format (no colon), preserve it
  if (/^\d{4}$/.test(timeStr.trim())) {
    return timeStr.trim();
  }
  
  // If in HH:MM format, remove colon
  if (/^\d{1,2}:\d{2}$/.test(timeStr.trim())) {
    const [hours, minutes] = timeStr.trim().split(':');
    return `${hours.padStart(2, '0')}${minutes}`;
  }
  
  // Try to parse as Date and extract time
  try {
    const date = new Date(timeStr);
    if (!isNaN(date.getTime())) {
      const hours = date.getUTCHours().toString().padStart(2, '0');
      const minutes = date.getUTCMinutes().toString().padStart(2, '0');
      return `${hours}${minutes}`;
    }
  } catch (error) {
    console.warn('Could not parse time for military format:', timeStr);
  }
  
  // Fallback: return original if we can't parse
  return timeStr;
}

/**
 * Format date to DD MMM format (e.g., "30 Aug")
 */
export function formatToShortDate(dateStr: string): string {
  if (!dateStr) return '';
  
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const day = date.getUTCDate().toString();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[date.getUTCMonth()];
      return `${day} ${month}`;
    }
  } catch (error) {
    console.warn('Could not parse date:', dateStr);
  }
  
  return dateStr;
}

/**
 * Calculate day offset between two dates
 * Returns "+1", "+2", etc. for next day flights, or empty string for same day
 */
export function calculateDayOffset(departureDate?: string, arrivalDate?: string): string {
  if (!departureDate || !arrivalDate) return '';
  
  try {
    const depDate = new Date(departureDate);
    const arrDate = new Date(arrivalDate);
    
    if (isNaN(depDate.getTime()) || isNaN(arrDate.getTime())) return '';
    
    const depDay = Math.floor(depDate.getTime() / (1000 * 60 * 60 * 24));
    const arrDay = Math.floor(arrDate.getTime() / (1000 * 60 * 60 * 24));
    const dayDiff = arrDay - depDay;
    
    if (dayDiff > 0) {
      return `+${dayDiff}`;
    }
    
    return '';
  } catch (error) {
    console.warn('Could not calculate day offset:', { departureDate, arrivalDate });
    return '';
  }
}

/**
 * Format flight route in military time format
 * Example: "2030 ACC to 0425+1 JNB"
 */
export function formatFlightRoute(info: FlightTimeInfo): string {
  const depTime = formatToMilitaryTime(info.departureTime);
  const arrTime = formatToMilitaryTime(info.arrivalTime);
  const dayOffset = calculateDayOffset(info.departureDate, info.arrivalDate);
  
  return `${depTime} ${info.departureCode} to ${arrTime}${dayOffset} ${info.arrivalCode}`;
}

/**
 * Format flight time for display with date and military time
 * Example: "Sun, 30 Aug, 2030"
 */
export function formatFlightTimeWithDate(timeString: string, includeWeekday: boolean = true): string {
  if (!timeString) return '';
  
  try {
    const date = new Date(timeString);
    if (isNaN(date.getTime())) return timeString;
    
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const weekday = weekdays[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const militaryTime = formatToMilitaryTime(timeString);
    
    if (includeWeekday) {
      return `${weekday}, ${day} ${month}, ${militaryTime}`;
    } else {
      return `${day} ${month}, ${militaryTime}`;
    }
  } catch (error) {
    console.warn('Could not format flight time with date:', timeString);
    return timeString;
  }
}

/**
 * Format flight time for display - just the military time part
 * Example: "2030"
 */
export function formatFlightTimeOnly(timeString: string): string {
  if (!timeString) return '';
  
  // If it's already in military format, return as-is
  if (/^\d{4}$/.test(timeString.trim())) {
    return timeString.trim();
  }
  
  return formatToMilitaryTime(timeString);
}