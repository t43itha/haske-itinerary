import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SegmentsTable } from "@/components/segments-table"
import { getItinerary } from "@/lib/actions"
import { Users, Download, Calendar, CheckCircle } from "lucide-react"

interface ConfirmationPageProps {
  params: {
    id: string
  }
}

export default async function ConfirmationPage({ params }: ConfirmationPageProps) {
  const itinerary = await getItinerary(params.id)

  if (!itinerary) {
    notFound()
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <CheckCircle className="w-12 h-12 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            Itinerary Created Successfully
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Your flight itinerary has been generated and saved
          </p>
        </div>

        {/* Itinerary Details */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Passengers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Passengers ({itinerary.passengers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {itinerary.passengers.map((passenger: { name: string; type: string }, index: number) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="font-medium">{passenger.name}</span>
                    <span className="text-sm text-gray-600 capitalize">
                      {passenger.type}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Trip Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Trip Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Created:</span>
                  <span className="font-medium">
                    {new Date(itinerary.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Segments:</span>
                  <span className="font-medium">{itinerary.segments.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Airlines:</span>
                  <span className="font-medium">
                    {Array.from(new Set(itinerary.segments.map((s: any) => s.airline))).length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Flight Segments */}
        <SegmentsTable segments={itinerary.segments} />

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            size="lg"
            className="flex items-center gap-2"
            asChild
          >
            <a href={`/api/itineraries/${params.id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Download className="w-4 h-4" />
              Download PDF
            </a>
          </Button>
          
          <Button 
            variant="outline" 
            size="lg"
            asChild
          >
            <a href="/">
              Create New Itinerary
            </a>
          </Button>
        </div>

        {/* Disclaimer */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <p className="text-sm text-yellow-800">
            <strong>Important:</strong> This itinerary is informational and not a travel document. 
            Please check with your airline for the most current flight information and bring 
            official tickets and identification for travel.
          </p>
        </div>
      </div>
    </div>
  )
}