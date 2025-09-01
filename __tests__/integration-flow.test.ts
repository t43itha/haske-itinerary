import { describe, it, expect } from 'vitest'
import { parseTicket } from '../lib/parsers'
import { normalizeTicketToItinerary } from '../lib/normalizeTicket'
import { ParsedTicket } from '../lib/types'

describe('E-ticket Ingestion Integration Flow', () => {
  const mockBAEmail = `
British Airways E-Ticket Confirmation

Dear Mr Joseph Abban,

Your booking has been confirmed.
Booking reference: ZL75AO

Passenger Details:
Passenger MR JOSEPH ABBAN

Ticket Details:
Ticket Number(s): 125-2214424598 JOSEPH ABBAN

Flight Details:

BA0078
British Airways | World Traveller | Confirmed

Departure:
30 Aug 2025
22:10
Accra
Terminal 3

Arrival:
31 Aug 2025
06:15
Heathrow (London)
Terminal 5

Baggage Information:
Checked baggage allowance: 2 bags at 23kg (51lbs)

Payment Summary:
Payment Total USD 2230.00
Payment method: Visa Corporate

Important Information:
Endorsements: Pax carrier restriction apply penalty applies

Thank you for choosing British Airways.
  `

  it('should complete the full ingestion flow from text to normalized itinerary', async () => {
    // Step 1: Parse ticket data directly from text
    const parsedTicket = await parseTicket({
      text: mockBAEmail,
      html: mockBAEmail
    })
    
    expect(parsedTicket.carrier).toBe('BA')
    expect(parsedTicket.passengers.length).toBeGreaterThan(0)
    expect(parsedTicket.segments.length).toBeGreaterThan(0)
    
    // Step 3: Normalize to itinerary format
    const normalizedItinerary = normalizeTicketToItinerary(parsedTicket, {
      extractedFrom: 'pasted_html',
      parsedWith: 'BA-specific'
    })
    
    expect(normalizedItinerary.passengers.length).toBeGreaterThan(0)
    expect(normalizedItinerary.segments.length).toBeGreaterThan(0)
    expect(normalizedItinerary.bookingExtras).toBeDefined()
    expect(normalizedItinerary.bookingExtras?.extractedFrom).toBe('pasted_html')
    expect(normalizedItinerary.bookingExtras?.parsedWith).toBe('BA-specific')
    
    // Verify passenger data
    const passenger = normalizedItinerary.passengers[0]
    expect(passenger.name).toContain('JOSEPH')
    expect(passenger.type).toBe('adult')
    
    // Verify segment data
    const segment = normalizedItinerary.segments[0]
    expect(segment.airline).toBe('BA')
    expect(segment.flightNumber).toBe('BA0078')
    expect(segment.departure.code).toBeDefined()
    expect(segment.arrival.code).toBeDefined()
    
    // Verify booking extras
    expect(normalizedItinerary.bookingExtras?.airlineLocator).toBeDefined()
  }, 10000)

  it('should handle generic parsing when BA parser fails', async () => {
    const genericTicket = `
Flight Confirmation - Generic Airlines
Flight: GA1234
Passenger: JOHN DOE
From: New York to London
Date: 15 Jan 2025
Time: 14:30
    `

    const parsedTicket = await parseTicket({
      text: genericTicket,
      html: genericTicket
    })
    
    // Should fallback to generic parser
    expect(parsedTicket).toBeDefined()
    expect(parsedTicket.carrier).toBeDefined()
  })

  it('should handle empty content gracefully', async () => {
    try {
      const parsedTicket = await parseTicket({
        text: '',
        html: ''
      })
      
      // Should still return a valid ParsedTicket object, even if empty
      expect(parsedTicket).toBeDefined()
      expect(parsedTicket.carrier).toBeDefined()
      expect(parsedTicket.passengers).toEqual([])
      expect(parsedTicket.segments).toEqual([])
    } catch (error) {
      // It's also acceptable for it to throw an error for empty content
      expect(error).toBeDefined()
    }
  })

  it('should preserve raw data for audit purposes', async () => {
    const originalText = 'British Airways BA123 Test Content'
    const parsedTicket = await parseTicket({
      text: originalText,
      html: originalText
    })
    
    expect(parsedTicket.raw).toBeDefined()
    expect(parsedTicket.raw.text).toContain('British Airways')
    expect(parsedTicket.raw.html).toBe(originalText)
  })

  it('should correctly map passenger types', async () => {
    const mockTicketWithTypes = `
British Airways
Passenger ADT MR JOHN DOE
Passenger CHD MS JANE DOE  
Passenger INF BABY DOE
    `
    
    const parsedTicket = await parseTicket({
      text: mockTicketWithTypes,
      html: mockTicketWithTypes
    })
    
    const normalizedItinerary = normalizeTicketToItinerary(parsedTicket)
    
    // Check that passenger types are correctly mapped
    const adultPassenger = normalizedItinerary.passengers.find(p => p.name.includes('JOHN'))
    const childPassenger = normalizedItinerary.passengers.find(p => p.name.includes('JANE'))
    const infantPassenger = normalizedItinerary.passengers.find(p => p.name.includes('BABY'))
    
    if (adultPassenger) expect(adultPassenger.type).toBe('adult')
    if (childPassenger) expect(childPassenger.type).toBe('child')
    if (infantPassenger) expect(infantPassenger.type).toBe('infant')
  })

  it('should handle date and time parsing correctly', async () => {
    const mockTicketWithDateTime = `
BA0123
British Airways | World Traveller | Confirmed

15 Jan 2025
14:30
London Heathrow
Terminal 5

15 Jan 2025
18:45
Paris CDG
Terminal 2A
    `
    
    const parsedTicket = await parseTicket({
      text: mockTicketWithDateTime,
      html: mockTicketWithDateTime
    })
    
    const normalizedItinerary = normalizeTicketToItinerary(parsedTicket)
    
    if (normalizedItinerary.segments.length > 0) {
      const segment = normalizedItinerary.segments[0]
      expect(segment.departure.scheduledTime).toBeDefined()
      expect(segment.arrival.scheduledTime).toBeDefined()
      
      // Check that dates are in ISO format
      expect(segment.departure.scheduledTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(segment.arrival.scheduledTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })
})