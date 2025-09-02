import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

async function generateHumanId(ctx: any): Promise<string> {
  // Try a few times to avoid rare collisions
  for (let i = 0; i < 5; i++) {
    const code = `HGT${Math.floor(10000 + Math.random() * 90000)}`; // HGT12345
    const existing = await ctx.db
      .query("itineraries")
      .filter((q: any) => q.eq(q.field("humanId"), code))
      .collect();
    if (existing.length === 0) return code;
  }
  // Fallback: time-based suffix (last 5 digits)
  const fallback = `HGT${Date.now().toString().slice(-5)}`;
  return fallback;
}

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
        cabin: v.optional(v.string()),
        bookingClass: v.optional(v.string()),
      })
    ),
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
  },
  handler: async (ctx: any, args: any) => {
    const humanId = await generateHumanId(ctx);
    const itinerary = await ctx.db.insert("itineraries", {
      humanId,
      passengers: args.passengers,
      segments: args.segments,
      createdAt: new Date().toISOString(),
      bookingExtras: args.bookingExtras,
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

export const getById = query({
  args: { id: v.id("itineraries") },
  handler: async (ctx, { id }) => {
    const itin = await ctx.db.get(id);
    if (!itin) return null;

    const [passengers, segments] = await Promise.all([
      ctx.db.query("passengers").withIndex("by_itin", q => q.eq("itineraryId", id)).collect(),
      ctx.db.query("segments").withIndex("by_itin", q => q.eq("itineraryId", id)).collect(),
    ]);

    segments.sort(
      (a, b) => new Date(a.dep.dateTime).getTime() - new Date(b.dep.dateTime).getTime()
    );

    return { ...itin, _id: id, passengers, segments };
  },
});

export const list = query({
  handler: async (ctx: any) => {
    return await ctx.db.query("itineraries").order("desc").collect();
  },
});
