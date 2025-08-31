"use client"

import { useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { format } from "date-fns"
import { Plus, Minus, Plane } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { searchFormSchema, type SearchFormData, type Passenger } from "@/lib/validations"

interface FlightSearchFormProps {
  onSubmit: (data: SearchFormData) => Promise<void>
  isLoading?: boolean
}

export function FlightSearchForm({ onSubmit, isLoading = false }: FlightSearchFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<SearchFormData>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: {
      passengers: [{ name: "", type: "adult" }],
      flightNumbers: [""],
      travelDate: format(new Date(), "yyyy-MM-dd"),
    },
  })

  const { fields: passengers, append: addPassenger, remove: removePassenger } = useFieldArray({
    control: form.control,
    name: "passengers" as any,
  })

  const { fields: flightNumbers, append: addFlight, remove: removeFlight } = useFieldArray({
    control: form.control,
    name: "flightNumbers" as any,
  })

  const handleSubmit = async (data: SearchFormData) => {
    try {
      setIsSubmitting(true)
      await onSubmit(data)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plane className="w-6 h-6" />
          Flight Search
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Passengers Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Passengers</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addPassenger({ name: "", type: "adult" })}
                  className="flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Passenger
                </Button>
              </div>

              {passengers.map((field, index) => (
                <div key={field.id} className="flex gap-4 items-end">
                  <FormField
                    control={form.control}
                    name={`passengers.${index}.name`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Full name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`passengers.${index}.type`}
                    render={({ field }) => (
                      <FormItem className="w-32">
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="adult">Adult</SelectItem>
                            <SelectItem value="child">Child</SelectItem>
                            <SelectItem value="infant">Infant</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {passengers.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removePassenger(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Flight Numbers Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Flight Numbers</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addFlight("")}
                  className="flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Flight
                </Button>
              </div>

              {flightNumbers.map((field, index) => (
                <div key={field.id} className="flex gap-4 items-end">
                  <FormField
                    control={form.control}
                    name={`flightNumbers.${index}`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>Flight Number {index + 1}</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., AA123 or BA456" 
                            {...field}
                            className="uppercase"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {flightNumbers.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeFlight(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Travel Date */}
            <FormField
              control={form.control}
              name="travelDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Travel Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting || isLoading}
            >
              {isSubmitting || isLoading ? "Searching..." : "Search Flights"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}