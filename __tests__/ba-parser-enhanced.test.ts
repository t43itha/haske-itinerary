import { describe, it, expect } from 'vitest'
import { parseBA, looksLikeBA } from '../lib/parsers/ba'
import { normalizeTicketToItinerary } from '../lib/normalizeTicket'

// Sample data extracted from the BA PDF
const SAMPLE_BA_PDF_CONTENT = `
Your e-ticket receipt ZL75AO: 30 Aug 2025 22:10

From British Airways e-ticket <BA.e-ticket@email.ba.com>
Date Tue 05/08/2025 10:57
To info@haskeglobaltravel.com

Your booking confirmation
Dear Mr Owusu afram jnr, Booking reference: ZL75AO
Thank you for booking with British Airways.

Your Itinerary
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

BA1306
British Airways | Euro Traveller | Confirmed
31 Aug 2025
07:55
Heathrow (London)
Terminal 5
31 Aug 2025
09:30
Aberdeen

BA1329
British Airways | Euro Traveller | Confirmed
7 Sep 2025
05:40
Aberdeen
7 Sep 2025
07:25
Heathrow (London)
Terminal 5

BA0081
British Airways | World Traveller | Confirmed
7 Sep 2025
12:40
Heathrow (London)
Terminal 5
7 Sep 2025
18:25
Accra
Terminal 3

| Passenger | MR JOSEPH ABBAN |

Baggage allowances
Checked baggage
Accra to London: 2 bags at 23kg (51lbs)
London to Aberdeen: 2 bags at 23kg (51lbs)
Aberdeen to London: 2 bags at 23kg (51lbs)
London to Accra: 2 bags at 23kg (51lbs)

Hand baggage
1 handbag/laptop bag, plus 1 additional cabin bag

Food and drink information
Flights Meals
Accra to London: Meal
London to Aberdeen: Food and Beverages for Purchase
Aberdeen to London: Food and Beverages for Purchase
London to Accra: Meal

Payment Information
Ticket Number(s): 125-2214424598 (MR JOSEPH ABBAN)
Ticket(s) Valid until: 5 Aug 2026
Payment Total: USD 2230.00
Fare Details: USD 1500.00
Carrier Imposed Charge: USD 407.00
IATA Number: 24490550

Endorsements: Pax carrier restriction apply penalty applies
`

describe('Enhanced BA Parser', () => {
  it('should identify BA content correctly', () => {
    expect(looksLikeBA({ text: SAMPLE_BA_PDF_CONTENT })).toBe(true)
  })

  it('should extract booking reference correctly', async () => {
    const result = await parseBA({ text: SAMPLE_BA_PDF_CONTENT })
    expect(result.airlineLocator).toBe('ZL75AO')
  })

  it('should extract passenger name correctly (not cardholder)', async () => {
    const result = await parseBA({ text: SAMPLE_BA_PDF_CONTENT })
    expect(result.passengers).toHaveLength(1)
    expect(result.passengers[0].fullName).toBe('JOSEPH ABBAN')
    // Should NOT extract the cardholder name "EUGENE OWUSU AFRAM JNR"
    expect(result.passengers[0].fullName).not.toBe('EUGENE OWUSU AFRAM JNR')
  })

  it('should extract all flight segments correctly', async () => {
    const result = await parseBA({ text: SAMPLE_BA_PDF_CONTENT })
    expect(result.segments).toHaveLength(4)
    
    // Check first segment
    const firstSegment = result.segments[0]
    expect(firstSegment.marketingFlightNo).toBe('BA0078')
    expect(firstSegment.cabin).toBe('ECONOMY') // Mapped from "World Traveller"
    expect(firstSegment.dep.iata).toBe('ACC')
    expect(firstSegment.dep.terminal).toBe('3')
    expect(firstSegment.arr.iata).toBe('LHR')
    expect(firstSegment.arr.terminal).toBe('5')

    // Check second segment
    const secondSegment = result.segments[1]
    expect(secondSegment.marketingFlightNo).toBe('BA1306')
    expect(secondSegment.cabin).toBe('ECONOMY') // Mapped from "Euro Traveller"
  })

  it('should extract ticket numbers with passenger association', async () => {
    const result = await parseBA({ text: SAMPLE_BA_PDF_CONTENT })
    expect(result.tickets).toHaveLength(1)
    expect(result.tickets![0].number).toBe('125-2214424598')
    expect(result.tickets![0].paxName).toContain('JOSEPH ABBAN')
  })

  it('should extract baggage allowances correctly', async () => {
    const result = await parseBA({ text: SAMPLE_BA_PDF_CONTENT })
    expect(result.baggage).toBe('2 × 23kg')
    expect(result.handBaggage).toContain('1 handbag/laptop bag, plus 1 additional cabin bag')
  })

  it('should extract IATA number', async () => {
    const result = await parseBA({ text: SAMPLE_BA_PDF_CONTENT })
    expect(result.iataNumber).toBe('24490550')
  })

  it('should extract fare details correctly', async () => {
    const result = await parseBA({ text: SAMPLE_BA_PDF_CONTENT })
    expect(result.fareDetails?.baseFare).toBe(1500.00)
    expect(result.fareDetails?.currency).toBe('USD')
    expect(result.fareDetails?.carrierCharges).toBe(407.00)
    expect(result.fareDetails?.total).toBe(2230.00)
  })

  it('should extract fare notes', async () => {
    const result = await parseBA({ text: SAMPLE_BA_PDF_CONTENT })
    expect(result.fareNotes).toContain('Pax carrier restriction apply penalty applies')
  })

  it('should normalize to itinerary format correctly', async () => {
    const result = await parseBA({ text: SAMPLE_BA_PDF_CONTENT })
    const normalized = normalizeTicketToItinerary(result, {
      extractedFrom: 'file',
      parsedWith: 'BA-enhanced'
    })

    expect(normalized.passengers).toHaveLength(1)
    expect(normalized.passengers[0].name).toBe('JOSEPH ABBAN')
    expect(normalized.segments).toHaveLength(4)
    
    // Check booking extras
    expect(normalized.bookingExtras?.airlineLocator).toBe('ZL75AO')
    expect(normalized.bookingExtras?.iataNumber).toBe('24490550')
    expect(normalized.bookingExtras?.baggage).toBe('2 × 23kg checked')
    expect(normalized.bookingExtras?.handBaggage).toContain('handbag/laptop bag')
    expect(normalized.bookingExtras?.fareDetails?.total).toBe(2230.00)
    expect(normalized.bookingExtras?.ticketNumbers).toHaveLength(1)
  })

  it('should extract meal service information', async () => {
    const result = await parseBA({ text: SAMPLE_BA_PDF_CONTENT })
    
    // Meal service should be extracted per segment
    const longHaulSegments = result.segments.filter(s => 
      s.marketingFlightNo === 'BA0078' || s.marketingFlightNo === 'BA0081'
    )
    const shortHaulSegments = result.segments.filter(s => 
      s.marketingFlightNo === 'BA1306' || s.marketingFlightNo === 'BA1329'
    )
    
    // Long-haul segments should have "Meal"
    longHaulSegments.forEach(segment => {
      expect((segment as any).mealService).toBe('Meal')
    })
    
    // Short-haul segments should have "Food and Beverages for Purchase"
    shortHaulSegments.forEach(segment => {
      expect((segment as any).mealService).toBe('Food and Beverages for Purchase')
    })
  })
})