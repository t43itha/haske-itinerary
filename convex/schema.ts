import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  itineraries: defineTable({
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
      })
    ),
    createdAt: v.string(),
  }),
});