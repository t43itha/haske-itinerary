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
  flightNumber: string
  airline: {
    name: string
    iata: string
  }
  aircraft?: {
    model: string
  }
  departure: {
    airport: {
      name: string
      iata: string
    }
    scheduledTimeUtc: string
    actualTimeUtc?: string
    terminal?: string
    gate?: string
  }
  arrival: {
    airport: {
      name: string
      iata: string
    }
    scheduledTimeUtc: string
    actualTimeUtc?: string
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

function formatFlightTime(utcTime: string, timezone: string): string {
  try {
    // For simplicity, we'll just format the UTC time
    // In production, you'd use a proper timezone library like date-fns-tz
    return format(parseISO(utcTime), 'yyyy-MM-dd HH:mm')
  } catch {
    // Fallback to the original string if parsing fails
    return utcTime
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
  const departureTimezone = getTimezoneForAirport(data.departure.airport.iata)
  const arrivalTimezone = getTimezoneForAirport(data.arrival.airport.iata)
  
  const codeshares = data.codeshares?.map(cs => 
    `${cs.airline.iata}${cs.flightNumber}`
  ) || []

  return {
    airline: data.airline.name,
    flightNumber: data.flightNumber,
    aircraft: data.aircraft?.model,
    departure: {
      airport: data.departure.airport.name,
      code: data.departure.airport.iata,
      scheduledTime: formatFlightTime(data.departure.scheduledTimeUtc, departureTimezone),
      actualTime: data.departure.actualTimeUtc 
        ? formatFlightTime(data.departure.actualTimeUtc, departureTimezone)
        : undefined,
      terminal: data.departure.terminal,
      gate: data.departure.gate,
    },
    arrival: {
      airport: data.arrival.airport.name,
      code: data.arrival.airport.iata,
      scheduledTime: formatFlightTime(data.arrival.scheduledTimeUtc, arrivalTimezone),
      actualTime: data.arrival.actualTimeUtc 
        ? formatFlightTime(data.arrival.actualTimeUtc, arrivalTimezone)
        : undefined,
      terminal: data.arrival.terminal,
      gate: data.arrival.gate,
    },
    status: data.status,
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
    
    if (!data || data.length === 0) {
      throw new Error(`No flight data found for ${flightNo} on ${date}`)
    }

    return data.map(normalizeFlightData)
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Failed to fetch flight data')
  }
}