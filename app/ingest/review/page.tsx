"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Check, X, ArrowLeft, Save, AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ParsedTicket } from "@/lib/types"
import { normalizeTicketToItinerary, type NormalizedItinerary } from "@/lib/normalizeTicket"
import { createItineraryFromParsedTicket } from "@/lib/actions"
import { formatFlightTimeOnly } from "@/lib/utils/timeFormatting"
import { ErrorBoundary } from "@/components/error-boundary"

interface FieldChange {
  field: string;
  label: string;
  current: string | null;
  parsed: string | null;
  apply: boolean;
  category: 'passenger' | 'segment' | 'booking' | 'general';
}

export default function ReviewPage() {
  const router = useRouter()
  const [parsedData, setParsedData] = useState<ParsedTicket | null>(null)
  const [currentItinerary, setCurrentItinerary] = useState<NormalizedItinerary | null>(null)
  const [fieldChanges, setFieldChanges] = useState<FieldChange[]>([])
  const [isApplying, setIsApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Load parsed data from session storage
    const storedData = sessionStorage.getItem('parsedTicketData')
    
    if (!storedData) {
      setError('No parsed ticket data found. Please go back and extract data first.')
      return
    }
    
    try {
      const parsedTicketData: ParsedTicket = JSON.parse(storedData)
      setParsedData(parsedTicketData)
      
      // Mock current itinerary (empty for new) - in the future this could come from existing data
      const mockCurrentItinerary: NormalizedItinerary = {
        passengers: [],
        segments: [],
        createdAt: new Date().toISOString()
      }
      
      setCurrentItinerary(mockCurrentItinerary)
      
      // Generate field changes comparison
      generateFieldChanges(mockCurrentItinerary, parsedTicketData)
    } catch (err) {
      setError('Failed to parse stored ticket data. Please try extracting again.')
      console.error('Error parsing stored data:', err)
    }
  }, [])

  const generateFieldChanges = (current: NormalizedItinerary, parsed: ParsedTicket) => {
    const changes: FieldChange[] = []
    const normalized = normalizeTicketToItinerary(parsed, { 
      extractedFrom: 'file',
      parsedWith: 'BA-specific' 
    })

    // Compare passengers
    if (normalized.passengers.length > current.passengers.length) {
      normalized.passengers.forEach((passenger, index) => {
        if (index >= current.passengers.length) {
          changes.push({
            field: `passenger-${index}-name`,
            label: `Passenger ${index + 1} Name`,
            current: null,
            parsed: passenger.name,
            apply: true,
            category: 'passenger'
          })
          changes.push({
            field: `passenger-${index}-type`,
            label: `Passenger ${index + 1} Type`,
            current: null,
            parsed: passenger.type,
            apply: true,
            category: 'passenger'
          })
        }
      })
    }

    // Compare segments
    if (normalized.segments.length > current.segments.length) {
      normalized.segments.forEach((segment, index) => {
        if (index >= current.segments.length) {
          changes.push({
            field: `segment-${index}-flight`,
            label: `Flight ${index + 1} Number`,
            current: null,
            parsed: segment.flightNumber,
            apply: true,
            category: 'segment'
          })
          changes.push({
            field: `segment-${index}-departure`,
            label: `Flight ${index + 1} Departure`,
            current: null,
            parsed: `${formatFlightTimeOnly(segment.departure.scheduledTime)} ${segment.departure.airport} (${segment.departure.code})`,
            apply: true,
            category: 'segment'
          })
          changes.push({
            field: `segment-${index}-arrival`,
            label: `Flight ${index + 1} Arrival`,
            current: null,
            parsed: `${formatFlightTimeOnly(segment.arrival.scheduledTime)} ${segment.arrival.airport} (${segment.arrival.code})`,
            apply: true,
            category: 'segment'
          })
          if (segment.cabin) {
            changes.push({
              field: `segment-${index}-cabin`,
              label: `Flight ${index + 1} Cabin`,
              current: null,
              parsed: segment.cabin,
              apply: true,
              category: 'segment'
            })
          }
        }
      })
    }

    // Add booking extras
    if (normalized.bookingExtras) {
      const extras = normalized.bookingExtras
      
      if (extras.airlineLocator) {
        changes.push({
          field: 'booking-reference',
          label: 'Booking Reference',
          current: null,
          parsed: extras.airlineLocator,
          apply: true,
          category: 'booking'
        })
      }
      
      if (extras.baggage) {
        changes.push({
          field: 'baggage',
          label: 'Baggage Allowance',
          current: null,
          parsed: extras.baggage,
          apply: true,
          category: 'booking'
        })
      }
      
      if (extras.payments && extras.payments.length > 0) {
        const payment = extras.payments[0]
        changes.push({
          field: 'payment',
          label: 'Payment Total',
          current: null,
          parsed: `${payment.currency} ${payment.amount.toFixed(2)}${payment.method ? ` via ${payment.method}` : ''}`,
          apply: true,
          category: 'booking'
        })
      }
      
      if (extras.fareNotes) {
        changes.push({
          field: 'fare-notes',
          label: 'Fare Restrictions',
          current: null,
          parsed: extras.fareNotes,
          apply: true,
          category: 'booking'
        })
      }
    }

    setFieldChanges(changes)
  }

  const toggleFieldApplication = (fieldId: string) => {
    setFieldChanges(prev => prev.map(change => 
      change.field === fieldId 
        ? { ...change, apply: !change.apply }
        : change
    ))
  }

  const selectAllInCategory = (category: string, select: boolean) => {
    setFieldChanges(prev => prev.map(change => 
      change.category === category 
        ? { ...change, apply: select }
        : change
    ))
  }

  const applyChanges = async () => {
    if (!parsedData) return
    
    setIsApplying(true)
    setError(null)

    try {
      // Filter only the changes user wants to apply
      const changesToApply = fieldChanges.filter(change => change.apply)
      
      if (changesToApply.length === 0) {
        setError('No changes selected to apply')
        return
      }

      // Create normalized itinerary with selected changes
      const normalized = normalizeTicketToItinerary(parsedData, {
        extractedFrom: 'file',
        parsedWith: 'AI-first' // Updated to reflect new parser mode
      })

      // Get selected field IDs for optional field filtering in the future
      const selectedFieldIds = changesToApply.map(change => change.field)

      // Save to Convex database - server action returns the ID
      const itineraryId = await createItineraryFromParsedTicket(normalized, selectedFieldIds)
      
      // Clear session storage since we've successfully saved
      sessionStorage.removeItem('parsedTicketData')
      
      // Navigate to confirmation page with the new itinerary ID
      router.push(`/confirmation/${itineraryId}`)
      
    } catch (err) {
      console.error('Error applying changes:', err)
      setError(err instanceof Error ? err.message : 'Failed to apply changes')
    } finally {
      setIsApplying(false)
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'passenger': return 'bg-blue-50 border-blue-200'
      case 'segment': return 'bg-green-50 border-green-200'
      case 'booking': return 'bg-purple-50 border-purple-200'
      default: return 'bg-gray-50 border-gray-200'
    }
  }

  const getCategoryBadgeVariant = (category: string) => {
    switch (category) {
      case 'passenger': return 'default'
      case 'segment': return 'secondary'  
      case 'booking': return 'outline'
      default: return 'secondary'
    }
  }

  if (!parsedData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>Loading parsed data...</p>
        </div>
      </div>
    )
  }

  const categoryGroups = fieldChanges.reduce((acc, change) => {
    if (!acc[change.category]) acc[change.category] = []
    acc[change.category].push(change)
    return acc
  }, {} as Record<string, FieldChange[]>)

  return (
    <ErrorBoundary>
      <div className="px-4 sm:px-6 lg:px-8 pb-8">
        <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Import
          </Button>
          
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Review & Apply Changes
            </h1>
            <p className="mt-4 text-lg text-gray-600">
              Review the extracted flight information and select which fields to apply to your itinerary
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Extraction Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <strong>Carrier:</strong> {parsedData.carrier}
              </div>
              <div>
                <strong>Changes Found:</strong> {fieldChanges.length}
              </div>
              <div>
                <strong>Selected:</strong> {fieldChanges.filter(c => c.apply).length}
              </div>
              <div>
                <strong>Parser Used:</strong> {parsedData?.carrier ? `${parsedData.carrier}-specific + AI` : 'AI-first'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Changes by Category */}
        {Object.entries(categoryGroups).map(([category, changes]) => (
          <Card key={category} className={`mb-6 ${getCategoryColor(category)}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="capitalize">{category} Changes</CardTitle>
                  <Badge variant={getCategoryBadgeVariant(category)}>
                    {changes.length}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectAllInCategory(category, true)}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectAllInCategory(category, false)}
                  >
                    Deselect All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Apply</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>Current Value</TableHead>
                      <TableHead>Parsed Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {changes.map((change) => (
                      <TableRow key={change.field}>
                        <TableCell>
                          <button
                            onClick={() => toggleFieldApplication(change.field)}
                            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${
                              change.apply 
                                ? 'bg-green-500 border-green-500 text-white' 
                                : 'border-gray-300 hover:border-gray-400'
                            }`}
                          >
                            {change.apply && <Check className="w-4 h-4" />}
                          </button>
                        </TableCell>
                        <TableCell className="font-medium">
                          {change.label}
                        </TableCell>
                        <TableCell>
                          <span className="text-gray-500 italic">
                            {change.current || 'Not set'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-green-700">
                            {change.parsed || 'N/A'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Actions */}
        <div className="flex justify-center gap-4 pt-6">
          <Button
            variant="outline"
            onClick={() => router.back()}
            disabled={isApplying}
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={applyChanges}
            disabled={isApplying || fieldChanges.filter(c => c.apply).length === 0}
            size="lg"
          >
            {isApplying ? (
              <>
                <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Applying...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Apply {fieldChanges.filter(c => c.apply).length} Changes
              </>
            )}
          </Button>
        </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
