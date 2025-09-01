import { describe, it, expect } from 'vitest'
import { parseBA, looksLikeBA } from '../lib/parsers/ba'
import { ParsedTicket } from '../lib/types'

describe('BA Parser', () => {
  describe('looksLikeBA', () => {
    it('should identify BA content by airline name', () => {
      const input = { text: 'This is a British Airways e-ticket' }
      expect(looksLikeBA(input)).toBe(true)
    })

    it('should identify BA content by domain', () => {
      const input = { text: 'Visit ba.com for more information' }
      expect(looksLikeBA(input)).toBe(true)
    })

    it('should identify BA content by flight number', () => {
      const input = { text: 'Your flight BA0078 is confirmed' }
      expect(looksLikeBA(input)).toBe(true)
    })

    it('should identify BA content by specific terminology', () => {
      const input = { text: 'Your World Traveller seat is confirmed' }
      expect(looksLikeBA(input)).toBe(true)
    })

    it('should reject non-BA content', () => {
      const input = { text: 'This is a Lufthansa e-ticket LH456' }
      expect(looksLikeBA(input)).toBe(false)
    })
  })

  describe('parseBA', () => {
    const mockBATicket = `
British Airways E-Ticket
Booking reference: ZL75AO

Passenger MR JOSEPH ABBAN

Ticket Number(s)
125-2214424598 JOSEPH ABBAN

Flight Details:

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

Baggage
Checked baggage allowance: 2 bags at 23kg (51lbs)

Payment Total USD 2230.00
Paid via Visa Corporate

Endorsements Pax carrier restriction apply penalty applies
    `

    it('should extract booking reference', async () => {
      const result = await parseBA({ text: mockBATicket })
      expect(result.airlineLocator).toBe('ZL75AO')
    })

    it('should extract passenger information', async () => {
      const result = await parseBA({ text: mockBATicket })
      expect(result.passengers).toHaveLength(1)
      expect(result.passengers[0].fullName).toBe('JOSEPH ABBAN')
    })

    it('should extract ticket numbers', async () => {
      const result = await parseBA({ text: mockBATicket })
      expect(result.tickets).toHaveLength(1)
      expect(result.tickets![0].number).toBe('125-2214424598')
      expect(result.tickets![0].paxName).toContain('JOSEPH')
    })

    it('should extract flight segments with all details', async () => {
      const result = await parseBA({ text: mockBATicket })
      
      expect(result.segments).toHaveLength(1)
      
      const segment = result.segments[0]
      expect(segment.marketingFlightNo).toBe('BA0078')
      expect(segment.cabin).toBe('ECONOMY') // World Traveller maps to ECONOMY
      
      // Departure details
      expect(segment.dep.date).toBe('30 Aug 2025')
      expect(segment.dep.timeLocal).toBe('22:10')
      expect(segment.dep.city).toBe('Accra')
      expect(segment.dep.terminal).toBe('3')
      expect(segment.dep.iata).toBe('ACC')
      
      // Arrival details
      expect(segment.arr.date).toBe('31 Aug 2025')
      expect(segment.arr.timeLocal).toBe('06:15')
      expect(segment.arr.city).toBe('London')
      expect(segment.arr.terminal).toBe('5')
      expect(segment.arr.iata).toBe('LHR')
    })

    it('should extract baggage information', async () => {
      const result = await parseBA({ text: mockBATicket })
      expect(result.baggage).toBe('2 x 23kg')
    })

    it('should extract payment information', async () => {
      const result = await parseBA({ text: mockBATicket })
      
      expect(result.payments).toHaveLength(1)
      expect(result.payments![0].currency).toBe('USD')
      expect(result.payments![0].total).toBe(2230.00)
      expect(result.payments![0].method).toContain('Visa')
    })

    it('should extract fare notes', async () => {
      const result = await parseBA({ text: mockBATicket })
      expect(result.fareNotes).toContain('carrier restriction apply penalty applies')
    })

    it('should handle multi-segment flights', async () => {
      const multiSegmentTicket = `
British Airways E-Ticket
Booking reference: ABC123

Passenger MS JANE DOE
Passenger MR JOHN SMITH

BA0123
British Airways | Club World | Confirmed

15 Jan 2025
14:30
Heathrow (London)
Terminal 5

15 Jan 2025
18:45
Paris Charles de Gaulle
Terminal 2A

BA0456
British Airways | Club World | Confirmed

16 Jan 2025
10:20
Paris Charles de Gaulle
Terminal 2A

16 Jan 2025
11:30
Amsterdam Schiphol
Terminal 3
      `

      const result = await parseBA({ text: multiSegmentTicket })
      
      expect(result.passengers).toHaveLength(2)
      expect(result.passengers[0].fullName).toBe('JANE DOE')
      expect(result.passengers[1].fullName).toBe('JOHN SMITH')
      
      expect(result.segments).toHaveLength(2)
      expect(result.segments[0].marketingFlightNo).toBe('BA0123')
      expect(result.segments[1].marketingFlightNo).toBe('BA0456')
      expect(result.segments[0].cabin).toBe('BUSINESS') // Club World maps to BUSINESS
    })

    it('should handle different cabin classes correctly', async () => {
      const cabinTestCases = [
        { input: 'World Traveller', expected: 'ECONOMY' },
        { input: 'Euro Traveller', expected: 'ECONOMY' },
        { input: 'World Traveller Plus', expected: 'PREMIUM_ECONOMY' },
        { input: 'Club Europe', expected: 'BUSINESS' },
        { input: 'Club World', expected: 'BUSINESS' },
        { input: 'First', expected: 'FIRST' }
      ]

      for (const testCase of cabinTestCases) {
        const ticketContent = `
BA0123
British Airways | ${testCase.input} | Confirmed
        `
        const result = await parseBA({ text: ticketContent })
        expect(result.segments[0]?.cabin).toBe(testCase.expected)
      }
    })

    it('should handle overnight flights (+1 day)', async () => {
      const overnightTicket = `
BA0078
British Airways | World Traveller | Confirmed

30 Aug 2025
23:45
London Heathrow
Terminal 5

31 Aug 2025
12:15
New York JFK
Terminal 7
      `

      const result = await parseBA({ text: overnightTicket })
      
      expect(result.segments[0].dep.date).toBe('30 Aug 2025')
      expect(result.segments[0].dep.timeLocal).toBe('23:45')
      expect(result.segments[0].arr.date).toBe('31 Aug 2025')
      expect(result.segments[0].arr.timeLocal).toBe('12:15')
    })

    it('should handle various baggage formats', async () => {
      const baggageTestCases = [
        { input: '2 bags at 23kg (51lbs)', expected: '2 x 23kg' },
        { input: 'Baggage allowance: 1 x 32kg', expected: '1 x 32kg' },
        { input: '3 bags 20kg each', expected: '3 x 20kg' }
      ]

      for (const testCase of baggageTestCases) {
        const ticketContent = `
British Airways E-Ticket
${testCase.input}
        `
        const result = await parseBA({ text: ticketContent })
        expect(result.baggage).toBe(testCase.expected)
      }
    })

    it('should be resilient to spacing and formatting variations', async () => {
      const messyTicket = `
  British   Airways    E-Ticket  
  
Booking   reference:   ZL75AO   

Passenger   MR    JOSEPH     ABBAN  


BA0078  
British Airways  |   World Traveller    |  Confirmed  

30   Aug   2025  
22:10  
Accra  
Terminal   3  

31    Aug   2025  
06:15  
Heathrow  (London)  
Terminal    5  
      `

      const result = await parseBA({ text: messyTicket })
      
      expect(result.airlineLocator).toBe('ZL75AO')
      expect(result.passengers[0].fullName).toBe('JOSEPH ABBAN')
      expect(result.segments[0].marketingFlightNo).toBe('BA0078')
    })

    it('should handle missing optional fields gracefully', async () => {
      const minimalTicket = `
British Airways
BA0123
Passenger JOHN DOE
      `

      const result = await parseBA({ text: minimalTicket })
      
      expect(result.carrier).toBe('BA')
      expect(result.passengers).toHaveLength(1)
      expect(result.segments).toHaveLength(1)
      expect(result.airlineLocator).toBeUndefined()
      expect(result.baggage).toBeUndefined()
      expect(result.payments).toEqual([])
    })

    it('should store raw data for audit purposes', async () => {
      const result = await parseBA({ text: mockBATicket, html: '<html>test</html>' })
      
      expect(result.raw.text).toBe(mockBATicket)
      expect(result.raw.html).toBe('<html>test</html>')
    })

    it('should handle currency variations in payments', async () => {
      const currencyTestCases = ['USD', 'GBP', 'EUR', 'CAD']
      
      for (const currency of currencyTestCases) {
        const ticketContent = `
British Airways
Payment Total ${currency} 1234.56
        `
        const result = await parseBA({ text: ticketContent })
        expect(result.payments![0].currency).toBe(currency)
        expect(result.payments![0].total).toBe(1234.56)
      }
    })

    it('should extract IATA codes from airport names', async () => {
      const airportTestCases = [
        { input: 'Heathrow (London)', expectedCity: 'London', expectedIATA: 'LHR' },
        { input: 'Accra', expectedCity: 'Accra', expectedIATA: 'ACC' },
        { input: 'New York JFK', expectedCity: 'New York', expectedIATA: 'JFK' }
      ]

      for (const testCase of airportTestCases) {
        const ticketContent = `
BA0123
British Airways | World Traveller | Confirmed

01 Jan 2025
12:00
${testCase.input}
Terminal 1

01 Jan 2025
15:00
London
Terminal 2
        `
        const result = await parseBA({ text: ticketContent })
        const segment = result.segments[0]
        
        expect(segment.dep.city).toBe(testCase.expectedCity)
        expect(segment.dep.iata).toBe(testCase.expectedIATA)
      }
    })
  })
})