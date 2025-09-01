"use client"

import { useState } from "react"
import Link from "next/link"
import { Upload } from "lucide-react"
import { FlightSearchForm } from "@/components/flight-search-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { type SearchFormData } from "@/lib/validations"

interface HomePageContentProps {
  onSubmit: (formData: FormData) => Promise<void>
}

export function HomePageContent({ onSubmit }: HomePageContentProps) {
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (data: SearchFormData) => {
    try {
      setError(null)
      
      // Create FormData for server action
      const formData = new FormData()
      formData.append("passengers", JSON.stringify(data.passengers))
      formData.append("flightNumbers", JSON.stringify(data.flightNumbers))
      formData.append("travelDate", data.travelDate)
      
      await onSubmit(formData)
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
            Search for flights manually or import from your e-ticket
          </p>
        </div>

        {/* Import Options */}
        <div className="grid grid-cols-1 gap-6 mb-8">
          <Card className="border-2 border-dashed border-blue-200 hover:border-blue-300 transition-colors">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <Upload className="w-5 h-5" />
                Import E-Ticket
              </CardTitle>
              <CardDescription>
                Upload your airline e-ticket (PDF, email) or paste HTML to auto-populate your itinerary
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Link href="/ingest">
                <Button size="lg" className="w-full">
                  Import E-Ticket
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mb-6">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-600">
            Or continue with manual flight search below
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        <div id="manual-form">
          <FlightSearchForm onSubmit={handleSubmit} />
        </div>
      </div>
    </div>
  )
}
