import { parseISO, format } from 'date-fns'

export interface FlightSegment {
  airline: string
  flightNumber: string
  aircraft?: string
  departure: {
    airport: string
    code: string
    scheduledTime: string
    actualTime?: string
    terminal?: string
    gate?: string
  }
  arrival: {
    airport: string
    code: string
    scheduledTime: string
    actualTime?: string
    terminal?: string
    gate?: string
  }
  status: string
  duration?: string
  codeshares?: string[]
}

interface AeroDataBoxResponse {
  number: string
  airline: {
    name: string
    iata: string
    icao: string
  }
  aircraft?: {
    model: string
  }
  departure: {
    airport: {
      name: string
      iata: string
      shortName: string
    }
    scheduledTime: {
      utc: string
      local: string
    }
    actualTime?: {
      utc: string
      local: string
    }
    terminal?: string
    gate?: string
  }
  arrival: {
    airport: {
      name: string
      iata: string
      shortName: string
    }
    scheduledTime: {
      utc: string
      local: string
    }
    actualTime?: {
      utc: string
      local: string
    }
    predictedTime?: {
      utc: string
      local: string
    }
    terminal?: string
    gate?: string
  }
  status: string
  codeshares?: Array<{
    airline: {
      name: string
      iata: string
    }
    flightNumber: string
  }>
}

function formatFlightTime(utcTime: string | undefined, timezone: string): string {
  if (!utcTime) {
    // Return a placeholder if no time is provided
    return 'Time TBA'
  }
  
  try {
    // For simplicity, we'll just format the UTC time
    // In production, you'd use a proper timezone library like date-fns-tz
    return format(parseISO(utcTime), 'yyyy-MM-dd HH:mm')
  } catch {
    // Fallback to the original string if parsing fails, or placeholder if empty
    return utcTime || 'Time TBA'
  }
}

function getTimezoneForAirport(airportCode: string): string {
  // Simplified timezone mapping - in production, use a comprehensive airport database
  const timezones: Record<string, string> = {
    'JFK': 'America/New_York',
    'LAX': 'America/Los_Angeles',
    'LHR': 'Europe/London',
    'CDG': 'Europe/Paris',
    'NRT': 'Asia/Tokyo',
    'SIN': 'Asia/Singapore',
    'DXB': 'Asia/Dubai',
    'FRA': 'Europe/Berlin',
    'AMS': 'Europe/Amsterdam',
    'MAD': 'Europe/Madrid',
    'BCN': 'Europe/Madrid',
    'FCO': 'Europe/Rome',
    'ZUR': 'Europe/Zurich',
    'VIE': 'Europe/Vienna',
    'CPH': 'Europe/Copenhagen',
    'ARN': 'Europe/Stockholm',
    'OSL': 'Europe/Oslo',
    'HEL': 'Europe/Helsinki',
    'WAW': 'Europe/Warsaw',
    'PRG': 'Europe/Prague',
    'BUD': 'Europe/Budapest',
    'ATH': 'Europe/Athens',
    'IST': 'Europe/Istanbul',
    'CAI': 'Africa/Cairo',
    'JNB': 'Africa/Johannesburg',
    'SYD': 'Australia/Sydney',
    'MEL': 'Australia/Melbourne',
    'PER': 'Australia/Perth',
    'YYZ': 'America/Toronto',
    'YVR': 'America/Vancouver',
    'GRU': 'America/Sao_Paulo',
    'EZE': 'America/Argentina/Buenos_Aires',
    'SCL': 'America/Santiago',
    'LIM': 'America/Lima',
    'BOG': 'America/Bogota',
    'MEX': 'America/Mexico_City',
    'GIG': 'America/Sao_Paulo',
    'CUN': 'America/Cancun',
    'PVG': 'Asia/Shanghai',
    'PEK': 'Asia/Shanghai',
    'ICN': 'Asia/Seoul',
    'BKK': 'Asia/Bangkok',
    'KUL': 'Asia/Kuala_Lumpur',
    'CGK': 'Asia/Jakarta',
    'MNL': 'Asia/Manila',
    'HKG': 'Asia/Hong_Kong',
    'TPE': 'Asia/Taipei',
    'BOM': 'Asia/Kolkata',
    'DEL': 'Asia/Kolkata',
    'BLR': 'Asia/Kolkata',
  }
  
  return timezones[airportCode] || 'UTC'
}

function normalizeFlightData(data: AeroDataBoxResponse): FlightSegment {
  // Validate minimum required fields
  if (!data.airline?.name || !data.number) {
    throw new Error('Invalid flight data: missing airline or flight number')
  }

  if (!data.departure?.airport?.name || !data.departure?.airport?.iata) {
    throw new Error('Invalid flight data: missing departure airport information')
  }

  if (!data.arrival?.airport?.name || !data.arrival?.airport?.iata) {
    throw new Error('Invalid flight data: missing arrival airport information')
  }

  const departureTimezone = getTimezoneForAirport(data.departure.airport.iata)
  const arrivalTimezone = getTimezoneForAirport(data.arrival.airport.iata)
  
  const codeshares = data.codeshares?.map(cs => 
    `${cs.airline.iata}${cs.flightNumber}`
  ) || []

  return {
    airline: data.airline.name,
    flightNumber: data.number,
    aircraft: data.aircraft?.model,
    departure: {
      airport: data.departure.airport.name,
      code: data.departure.airport.iata,
      scheduledTime: formatFlightTime(data.departure.scheduledTime?.utc, departureTimezone),
      actualTime: data.departure.actualTime?.utc 
        ? formatFlightTime(data.departure.actualTime.utc, departureTimezone)
        : undefined,
      terminal: data.departure.terminal,
      gate: data.departure.gate,
    },
    arrival: {
      airport: data.arrival.airport.name,
      code: data.arrival.airport.iata,
      scheduledTime: formatFlightTime(data.arrival.scheduledTime?.utc, arrivalTimezone),
      actualTime: (data.arrival.actualTime?.utc || data.arrival.predictedTime?.utc)
        ? formatFlightTime(data.arrival.actualTime?.utc || data.arrival.predictedTime?.utc, arrivalTimezone)
        : undefined,
      terminal: data.arrival.terminal,
      gate: data.arrival.gate,
    },
    status: data.status || 'Unknown',
    codeshares: codeshares.length > 0 ? codeshares : undefined,
  }
}

export async function getByFlightNoDate(
  flightNo: string,
  date: string
): Promise<FlightSegment[]> {
  const apiKey = process.env.AERODATABOX_API_KEY
  
  if (!apiKey) {
    throw new Error('AERODATABOX_API_KEY is not configured')
  }

  try {
    const response = await fetch(
      `https://aerodatabox.p.rapidapi.com/flights/number/${flightNo}/${date}?withAircraftImage=false&withLocation=false`,
      {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
        },
      }
    )

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Flight ${flightNo} not found for date ${date}`)
      }
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    const data: AeroDataBoxResponse[] = await response.json()
    
    // Log the raw API response for debugging
    console.log(`API Response for ${flightNo}:`, JSON.stringify(data, null, 2))
    
    if (!data || data.length === 0) {
      throw new Error(`No flight data found for ${flightNo} on ${date}`)
    }

    // Filter out any invalid flight data and log what we're processing
    const validFlights = data.filter(flight => {
      if (!flight.airline?.name || !flight.number) {
        console.warn(`Skipping invalid flight data for ${flightNo}:`, flight)
        return false
      }
      return true
    })

    if (validFlights.length === 0) {
      throw new Error(`No valid flight data found for ${flightNo} on ${date} - API returned incomplete data`)
    }

    return validFlights.map(normalizeFlightData)
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Failed to fetch flight data')
  }
}