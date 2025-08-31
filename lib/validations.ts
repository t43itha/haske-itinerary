import { z } from "zod"

export const flightNumberSchema = z
  .string()
  .regex(/^[A-Z]{2}[A-Z0-9]?\s?\d{1,4}[A-Z]?$/i, {
    message: "Invalid flight number format. Use format like 'AA123' or 'BA 456'",
  })
  .transform((val) => val.replace(/\s+/g, "").toUpperCase())

export const passengerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  type: z.enum(["adult", "child", "infant"]),
})

export const searchFormSchema = z.object({
  passengers: z.array(passengerSchema).min(1, "At least one passenger is required"),
  flightNumbers: z.array(flightNumberSchema).min(1, "At least one flight number is required"),
  travelDate: z.string().refine((date) => {
    const selectedDate = new Date(date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return selectedDate >= today
  }, {
    message: "Travel date cannot be in the past",
  }),
})

export type SearchFormData = z.infer<typeof searchFormSchema>
export type Passenger = z.infer<typeof passengerSchema>