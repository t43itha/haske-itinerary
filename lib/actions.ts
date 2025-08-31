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
        return await getByFlightNoDate(flightNo, validatedData.travelDate)
      } catch (error) {
        console.error(`Error fetching flight ${flightNo}:`, error)
        // Return empty array for failed flights rather than failing entire request
        return []
      }
    })

    const segmentResults = await Promise.all(segmentPromises)
    const allSegments = segmentResults.flat()

    if (allSegments.length === 0) {
      throw new Error("No flight data found for the specified flights")
    }

    // Save to Convex
    const itineraryId = await convex.mutation(api.itineraries.create, {
      passengers: validatedData.passengers,
      segments: allSegments,
    })

    // Redirect to confirmation page
    redirect(`/confirmation/${itineraryId}`)
  } catch (error) {
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