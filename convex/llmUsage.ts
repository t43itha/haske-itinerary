import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Record LLM usage for cost tracking
 */
export const recordUsage = mutation({
  args: {
    model: v.string(),
    tokensIn: v.number(),
    tokensOut: v.number(),
    cost: v.number(),
    purpose: v.string(),
    retryUsed: v.optional(v.boolean()),
    extractionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const timestamp = new Date().toISOString();
    
    // Insert usage record
    const usageId = await ctx.db.insert("llmUsage", {
      ...args,
      timestamp,
    });
    
    // Update rolling average statistics
    await updateRollingStats(ctx, args.model, args.tokensIn, args.tokensOut, args.cost);
    
    return usageId;
  },
});

/**
 * Update rolling average statistics for a model
 */
async function updateRollingStats(
  ctx: any,
  model: string,
  tokensIn: number,
  tokensOut: number,
  cost: number
) {
  const existingStats = await ctx.db
    .query("llmStats")
    .withIndex("by_model", (q: any) => q.eq("model", model))
    .first();
  
  const timestamp = new Date().toISOString();
  
  if (existingStats) {
    // Update existing stats with rolling average
    const totalCalls = existingStats.totalCalls + 1;
    const totalCost = existingStats.totalCost + cost;
    
    const avgTokensIn = (existingStats.avgTokensIn * existingStats.totalCalls + tokensIn) / totalCalls;
    const avgTokensOut = (existingStats.avgTokensOut * existingStats.totalCalls + tokensOut) / totalCalls;
    const avgCost = totalCost / totalCalls;
    
    await ctx.db.patch(existingStats._id, {
      avgTokensIn,
      avgTokensOut,
      avgCost,
      totalCalls,
      totalCost,
      lastUpdated: timestamp,
    });
  } else {
    // Create new stats record
    await ctx.db.insert("llmStats", {
      model,
      avgTokensIn: tokensIn,
      avgTokensOut: tokensOut,
      avgCost: cost,
      totalCalls: 1,
      totalCost: cost,
      lastUpdated: timestamp,
    });
  }
}

/**
 * Get usage statistics for all models
 */
export const getUsageStats = query({
  handler: async (ctx) => {
    const stats = await ctx.db.query("llmStats").collect();
    return stats;
  },
});

/**
 * Get recent usage history
 */
export const getRecentUsage = query({
  args: {
    limit: v.optional(v.number()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query;
    
    if (args.model) {
      query = ctx.db.query("llmUsage")
        .withIndex("by_model", (q: any) => q.eq("model", args.model))
        .order("desc");
    } else {
      query = ctx.db.query("llmUsage")
        .withIndex("by_timestamp")
        .order("desc");
    }
    
    const usage = await query.take(args.limit || 50);
    
    return usage;
  },
});

/**
 * Get total costs by model for a time period
 */
export const getCostsByModel = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("llmUsage").withIndex("by_timestamp");
    
    // Apply date filtering if provided
    if (args.startDate) {
      query = query.filter((q: any) => q.gte(q.field("timestamp"), args.startDate));
    }
    if (args.endDate) {
      query = query.filter((q: any) => q.lte(q.field("timestamp"), args.endDate));
    }
    
    const usage = await query.collect();
    
    // Group by model and sum costs
    const costsByModel = usage.reduce((acc: Record<string, { cost: number; calls: number; tokensIn: number; tokensOut: number }>, record) => {
      if (!acc[record.model]) {
        acc[record.model] = { cost: 0, calls: 0, tokensIn: 0, tokensOut: 0 };
      }
      acc[record.model].cost += record.cost;
      acc[record.model].calls += 1;
      acc[record.model].tokensIn += record.tokensIn;
      acc[record.model].tokensOut += record.tokensOut;
      return acc;
    }, {});
    
    return Object.entries(costsByModel).map(([model, data]) => ({
      model,
      ...data,
      avgCostPerCall: data.cost / data.calls,
    }));
  },
});

/**
 * Get usage summary for dashboard
 */
export const getUsageSummary = query({
  handler: async (ctx) => {
    const stats = await ctx.db.query("llmStats").collect();
    const recentUsage = await ctx.db
      .query("llmUsage")
      .withIndex("by_timestamp")
      .order("desc")
      .take(100);
    
    const totalCost = stats.reduce((sum, stat) => sum + stat.totalCost, 0);
    const totalCalls = stats.reduce((sum, stat) => sum + stat.totalCalls, 0);
    
    // Calculate last 24 hours usage
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentCost = recentUsage
      .filter(usage => usage.timestamp > yesterday)
      .reduce((sum, usage) => sum + usage.cost, 0);
    
    const recentCalls = recentUsage.filter(usage => usage.timestamp > yesterday).length;
    
    return {
      totalCost,
      totalCalls,
      recentCost, // Last 24 hours
      recentCalls, // Last 24 hours
      modelStats: stats,
      avgCostPerCall: totalCalls > 0 ? totalCost / totalCalls : 0,
    };
  },
});