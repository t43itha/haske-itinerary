import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  itineraries: defineTable({
    referenceCode: v.optional(v.string()),
    agency: v.optional(v.object({
      name: v.string(),
      consultant: v.optional(v.string()),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      address: v.optional(v.string()),
    })),
    refs: v.optional(v.object({
      airline: v.optional(v.string()), // PNR / Record Locator
      internal: v.optional(v.string()),
    })),
    baggage: v.optional(v.string()),
    fareNotes: v.optional(v.string()),
    status: v.optional(v.string()),
    createdAt: v.optional(v.union(v.number(), v.string())), // Date.now() or ISO string for compatibility
    // Backward compatibility fields (legacy schema)
    humanId: v.optional(v.string()),
    passengers: v.optional(v.array(v.any())),
    segments: v.optional(v.array(v.any())),
    bookingExtras: v.optional(v.any()),
  }),

  passengers: defineTable({
    itineraryId: v.id("itineraries"),
    fullName: v.string(),
    type: v.optional(v.union(v.literal("ADT"), v.literal("CHD"), v.literal("INF"))),
    seats: v.optional(v.object({})),
    ssrs: v.optional(v.array(v.string())),
  }).index("by_itin", ["itineraryId"]),

  segments: defineTable({
    itineraryId: v.id("itineraries"),
    marketingFlightNo: v.string(),
    operatingFlightNo: v.optional(v.string()),
    dep: v.object({
      iata: v.string(),
      city: v.optional(v.string()),
      dateTime: v.string(),
      tz: v.optional(v.string()),
    }),
    arr: v.object({
      iata: v.string(),
      city: v.optional(v.string()),
      dateTime: v.string(),
      tz: v.optional(v.string()),
      plusOne: v.optional(v.boolean()),
    }),
    termGate: v.optional(v.object({
      depTerminal: v.optional(v.string()),
      depGate: v.optional(v.string()),
      arrTerminal: v.optional(v.string()),
      arrGate: v.optional(v.string()),
    })),
    equipment: v.optional(v.object({
      iata: v.optional(v.string()),
      name: v.optional(v.string()),
    })),
    cabin: v.optional(v.string()),
    bookingClass: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    status: v.optional(v.string()),
  }).index("by_itin", ["itineraryId"]),

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
