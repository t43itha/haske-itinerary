import { z } from 'zod';

// Strict Zod schema for LLM-extracted ticket data
export const ParsedTicketSchema = z.object({
  carrier: z.string().min(2, "Carrier must be at least 2 characters"),
  airlineLocator: z.string().optional(),
  passengers: z.array(z.object({
    fullName: z.string().min(2, "Passenger name must be at least 2 characters"),
    type: z.enum(['ADT', 'CHD', 'INF']).optional()
  })).min(1, "At least one passenger is required"),
  tickets: z.array(z.object({
    number: z.string(),
    paxName: z.string(),
    validUntil: z.string().optional()
  })).optional(),
  baggage: z.string().optional(),
  handBaggage: z.string().optional(),
  segments: z.array(z.object({
    marketingFlightNo: z.string().min(3, "Flight number must be at least 3 characters"),
    cabin: z.string().optional(),
    bookingClass: z.string().optional(),
    mealService: z.string().optional(),
    dep: z.object({
      iata: z.string().optional(),
      city: z.string().optional(),
      terminal: z.string().optional(),
      timeLocal: z.string().optional(),
      date: z.string().optional()
    }),
    arr: z.object({
      iata: z.string().optional(),
      city: z.string().optional(),
      terminal: z.string().optional(),
      timeLocal: z.string().optional(),
      date: z.string().optional()
    })
  })).min(1, "At least one flight segment is required"),
  payments: z.array(z.object({
    currency: z.string(),
    total: z.number().positive("Payment total must be positive"),
    method: z.string().optional()
  })).optional(),
  fareDetails: z.object({
    baseFare: z.number().optional(),
    currency: z.string().optional(),
    carrierCharges: z.number().optional(),
    taxes: z.array(z.object({
      type: z.string(),
      amount: z.number(),
      description: z.string().optional()
    })).optional(),
    total: z.number().optional()
  }).optional(),
  fareNotes: z.string().optional(),
  iataNumber: z.string().optional(),
  raw: z.object({
    text: z.string().optional(),
    html: z.string().optional()
  }).optional()
});

export type LLMParsedTicket = z.infer<typeof ParsedTicketSchema>;

// Validation function to check if extraction has critical fields
export function isValidExtraction(result: any): boolean {
  try {
    const parsed = ParsedTicketSchema.parse(result);
    
    // Additional business logic validation for critical fields
    const hasCriticalData = !!(
      parsed.airlineLocator && // Booking reference is critical
      parsed.passengers.length > 0 && // At least one passenger
      parsed.segments.length > 0 && // At least one segment
      parsed.segments.every(s => s.marketingFlightNo && s.marketingFlightNo.length > 2) // Valid flight numbers
    );
    
    return hasCriticalData;
  } catch (error) {
    console.warn('Validation failed:', error);
    return false;
  }
}

// Schema for the LLM prompt response format
export const LLMPromptResponseSchema = z.object({
  carrier: z.string(),
  airlineLocator: z.string().optional(),
  passengers: z.array(z.object({
    fullName: z.string(),
    type: z.enum(['ADT', 'CHD', 'INF']).optional()
  })),
  tickets: z.array(z.object({
    number: z.string(),
    paxName: z.string(),
    validUntil: z.string().optional()
  })).optional(),
  baggage: z.string().optional(),
  handBaggage: z.string().optional(),
  segments: z.array(z.object({
    marketingFlightNo: z.string(),
    cabin: z.string().optional(),
    bookingClass: z.string().optional(),
    mealService: z.string().optional(),
    dep: z.object({
      iata: z.string().optional(),
      city: z.string().optional(),
      terminal: z.string().optional(),
      timeLocal: z.string().optional(),
      date: z.string().optional()
    }),
    arr: z.object({
      iata: z.string().optional(),
      city: z.string().optional(),
      terminal: z.string().optional(),
      timeLocal: z.string().optional(),
      date: z.string().optional()
    })
  })),
  payments: z.array(z.object({
    currency: z.string(),
    total: z.number(),
    method: z.string().optional()
  })).optional(),
  fareDetails: z.object({
    baseFare: z.number().optional(),
    currency: z.string().optional(),
    carrierCharges: z.number().optional(),
    taxes: z.array(z.object({
      type: z.string(),
      amount: z.number(),
      description: z.string().optional()
    })).optional(),
    total: z.number().optional()
  }).optional(),
  fareNotes: z.string().optional(),
  iataNumber: z.string().optional()
});

// Token usage tracking schema
export const TokenUsageSchema = z.object({
  model: z.string(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  cost: z.number().nonnegative(),
  purpose: z.string(),
  timestamp: z.string()
});