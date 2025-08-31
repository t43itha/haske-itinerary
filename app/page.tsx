"use client"

import { useState } from "react"
import { FlightSearchForm } from "@/components/flight-search-form"
import { searchFlights } from "@/lib/actions"
import { type SearchFormData } from "@/lib/validations"

export default function HomePage() {
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (data: SearchFormData) => {
    try {
      setError(null)
      
      // Create FormData for server action
      const formData = new FormData()
      formData.append("passengers", JSON.stringify(data.passengers))
      formData.append("flightNumbers", JSON.stringify(data.flightNumbers))
      formData.append("travelDate", data.travelDate)
      
      await searchFlights(formData)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to search flights")
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            Create Your Flight Itinerary
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Search for flights and generate a comprehensive itinerary with passenger details
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        <FlightSearchForm onSubmit={handleSubmit} />
      </div>
    </div>
  )
}