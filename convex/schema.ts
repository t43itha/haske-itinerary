import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  itineraries: defineTable({
    humanId: v.optional(v.string()),
    passengers: v.array(
      v.object({
        name: v.string(),
        type: v.union(v.literal("adult"), v.literal("child"), v.literal("infant")),
      })
    ),
    segments: v.array(
      v.object({
        airline: v.string(),
        flightNumber: v.string(),
        aircraft: v.optional(v.string()),
        departure: v.object({
          airport: v.string(),
          code: v.string(),
          scheduledTime: v.string(),
          actualTime: v.optional(v.string()),
          terminal: v.optional(v.string()),
          gate: v.optional(v.string()),
        }),
        arrival: v.object({
          airport: v.string(),
          code: v.string(),
          scheduledTime: v.string(),
          actualTime: v.optional(v.string()),
          terminal: v.optional(v.string()),
          gate: v.optional(v.string()),
        }),
        status: v.string(),
        duration: v.optional(v.string()),
        codeshares: v.optional(v.array(v.string())),
        cabin: v.optional(v.string()),
        bookingClass: v.optional(v.string()),
      })
    ),
    createdAt: v.string(),
    // E-ticket specific fields
    bookingExtras: v.optional(v.object({
      airlineLocator: v.optional(v.string()),
      iataNumber: v.optional(v.string()),
      ticketNumbers: v.optional(v.array(v.object({
        number: v.string(),
        passengerName: v.string(),
        validUntil: v.optional(v.string())
      }))),
      baggage: v.optional(v.string()),
      handBaggage: v.optional(v.string()),
      mealService: v.optional(v.array(v.object({
        segmentIndex: v.number(),
        service: v.string()
      }))),
      payments: v.optional(v.array(v.object({
        currency: v.string(),
        amount: v.number(),
        method: v.optional(v.string())
      }))),
      fareDetails: v.optional(v.object({
        baseFare: v.optional(v.number()),
        currency: v.optional(v.string()),
        carrierCharges: v.optional(v.number()),
        taxes: v.optional(v.array(v.object({
          type: v.string(),
          amount: v.number(),
          description: v.optional(v.string())
        }))),
        total: v.optional(v.number())
      })),
      fareNotes: v.optional(v.string()),
      extractedFrom: v.optional(v.string()), // 'file' or 'pasted_html'
      parsedWith: v.optional(v.string()), // 'BA-specific', 'generic', etc.
      extractedAt: v.optional(v.string()),
    }))
  }).index("by_humanId", ["humanId"]),

  // LLM usage tracking for cost visibility
  llmUsage: defineTable({
    model: v.string(),
    tokensIn: v.number(),
    tokensOut: v.number(),
    cost: v.number(),
    purpose: v.string(),
    timestamp: v.string(),
    retryUsed: v.optional(v.boolean()),
    extractionId: v.optional(v.string()), // Link to specific extraction attempt
  }).index("by_model", ["model"])
    .index("by_timestamp", ["timestamp"])
    .index("by_purpose", ["purpose"]),

  // Rolling average statistics for cost monitoring  
  llmStats: defineTable({
    model: v.string(),
    avgTokensIn: v.number(),
    avgTokensOut: v.number(),
    avgCost: v.number(),
    totalCalls: v.number(),
    totalCost: v.number(),
    lastUpdated: v.string(),
  }).index("by_model", ["model"]),
});
