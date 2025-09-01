"use server"

import { redirect } from "next/navigation"
import { ConvexHttpClient } from "convex/browser"
import { api } from "@/convex/_generated/api"
import { getByFlightNoDate, type FlightSegment } from "@/lib/providers/aerodatabox"
import { searchFormSchema, type SearchFormData } from "@/lib/validations"
import "@/lib/env" // Ensure environment validation runs

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function searchFlights(formData: FormData) {
  try {
    // Parse form data
    const rawData = {
      passengers: JSON.parse(formData.get("passengers") as string),
      flightNumbers: JSON.parse(formData.get("flightNumbers") as string),
      travelDate: formData.get("travelDate") as string,
    }

    // Validate input
    const validatedData = searchFormSchema.parse(rawData)

    // Fetch flight data for all flight numbers
    const segmentPromises = validatedData.flightNumbers.map(async (flightNo) => {
      try {
        const segments = await getByFlightNoDate(flightNo, validatedData.travelDate)
        return { flightNo, segments, success: true }
      } catch (error) {
        console.error(`Error fetching flight ${flightNo}:`, error)
        return { 
          flightNo, 
          segments: [], 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }
      }
    })

    const segmentResults = await Promise.all(segmentPromises)
    const allSegments = segmentResults.flatMap(result => result.segments)
    const failedFlights = segmentResults.filter(result => !result.success)

    // Provide detailed error messages
    if (allSegments.length === 0) {
      const errorMessages = failedFlights.map(f => `${f.flightNo}: ${f.error}`).join('; ')
      throw new Error(`No flight data found. Errors: ${errorMessages}`)
    }

    // Warn about partial failures but continue
    if (failedFlights.length > 0 && allSegments.length > 0) {
      const failedFlightNumbers = failedFlights.map(f => f.flightNo).join(', ')
      console.warn(`Some flights could not be fetched: ${failedFlightNumbers}`)
    }

    // Save to Convex
    const itineraryId = await convex.mutation(api.itineraries.create, {
      passengers: validatedData.passengers,
      segments: allSegments,
    })

    // Redirect to confirmation page
    redirect(`/confirmation/${itineraryId}`)
  } catch (error) {
    // Allow Next.js redirects to pass through
    if (error && typeof error === 'object' && 'digest' in error && 
        typeof (error as any).digest === 'string' && 
        (error as any).digest.startsWith('NEXT_REDIRECT')) {
      throw error
    }
    
    console.error("Flight search error:", error)
    throw new Error(
      error instanceof Error ? error.message : "Failed to search flights"
    )
  }
}

export async function getItinerary(id: string) {
  try {
    const itinerary = await convex.query(api.itineraries.get, { 
      id: id as any // ConvexAPI ID type
    })
    return itinerary
  } catch (error) {
    console.error("Error fetching itinerary:", error)
    return null
  }
}

export async function createItineraryFromParsedTicket(
  normalizedItinerary: any, // NormalizedItinerary type from normalizeTicket.ts
  selectedFields: string[] = [] // Fields that user selected to apply
): Promise<string> {
  try {
    console.log('Creating itinerary from parsed ticket data...')
    
    // Create itinerary with normalized data
    const itineraryId = await convex.mutation(api.itineraries.create, {
      passengers: normalizedItinerary.passengers,
      segments: normalizedItinerary.segments,
      bookingExtras: normalizedItinerary.bookingExtras,
    })

    console.log('Itinerary created successfully:', itineraryId)
    
    // Return the ID for client-side navigation
    return itineraryId
  } catch (error) {
    console.error("Create itinerary error:", error)
    throw new Error(
      error instanceof Error ? error.message : "Failed to create itinerary"
    )
  }
}