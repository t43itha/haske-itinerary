import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
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
  },
  handler: async (ctx: any, args: any) => {
    const itinerary = await ctx.db.insert("itineraries", {
      passengers: args.passengers,
      segments: args.segments,
      createdAt: new Date().toISOString(),
    });
    return itinerary;
  },
});

export const get = query({
  args: { id: v.id("itineraries") },
  handler: async (ctx: any, args: any) => {
    return await ctx.db.get(args.id);
  },
});

export const list = query({
  handler: async (ctx: any) => {
    return await ctx.db.query("itineraries").order("desc").collect();
  },
});