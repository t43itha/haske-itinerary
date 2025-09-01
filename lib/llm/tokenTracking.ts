import { api } from '@/convex/_generated/api';
import { ConvexHttpClient } from 'convex/browser';
import { ExtractionResult } from './extractTicket';

/**
 * Initialize Convex client for token tracking
 */
function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is required');
  }
  return new ConvexHttpClient(convexUrl);
}

/**
 * Record LLM usage in Convex database
 */
export async function recordTokenUsage(
  extractionResult: ExtractionResult,
  purpose: string,
  extractionId?: string
): Promise<void> {
  try {
    const convex = getConvexClient();
    const { tokenUsage } = extractionResult;
    
    await convex.mutation(api.llmUsage.recordUsage, {
      model: tokenUsage.model,
      tokensIn: tokenUsage.tokensIn,
      tokensOut: tokenUsage.tokensOut,
      cost: tokenUsage.cost,
      purpose,
      retryUsed: tokenUsage.retryUsed,
      extractionId,
    });
    
    console.log('Token usage recorded:', {
      model: tokenUsage.model,
      tokensIn: tokenUsage.tokensIn,
      tokensOut: tokenUsage.tokensOut,
      cost: tokenUsage.cost,
      retryUsed: tokenUsage.retryUsed,
    });
  } catch (error) {
    console.error('Failed to record token usage:', error);
    // Don't throw - token tracking shouldn't break the extraction flow
  }
}

/**
 * Record multiple token usages (for debugging/testing)
 */
export async function recordMultipleUsages(
  usages: Array<{
    model: string;
    tokensIn: number;
    tokensOut: number;
    cost: number;
    purpose: string;
    retryUsed?: boolean;
    extractionId?: string;
  }>
): Promise<void> {
  const convex = getConvexClient();
  
  const promises = usages.map(usage =>
    convex.mutation(api.llmUsage.recordUsage, usage)
  );
  
  try {
    await Promise.all(promises);
    console.log(`Recorded ${usages.length} token usage entries`);
  } catch (error) {
    console.error('Failed to record multiple token usages:', error);
  }
}

/**
 * Get usage statistics for monitoring
 */
export async function getUsageStats() {
  try {
    const convex = getConvexClient();
    return await convex.query(api.llmUsage.getUsageStats);
  } catch (error) {
    console.error('Failed to get usage stats:', error);
    return [];
  }
}

/**
 * Get recent usage history
 */
export async function getRecentUsage(limit = 50, model?: string) {
  try {
    const convex = getConvexClient();
    return await convex.query(api.llmUsage.getRecentUsage, { limit, model });
  } catch (error) {
    console.error('Failed to get recent usage:', error);
    return [];
  }
}

/**
 * Get costs by model for a time period
 */
export async function getCostsByModel(startDate?: string, endDate?: string) {
  try {
    const convex = getConvexClient();
    return await convex.query(api.llmUsage.getCostsByModel, { startDate, endDate });
  } catch (error) {
    console.error('Failed to get costs by model:', error);
    return [];
  }
}

/**
 * Get usage summary for dashboard
 */
export async function getUsageSummary() {
  try {
    const convex = getConvexClient();
    return await convex.query(api.llmUsage.getUsageSummary);
  } catch (error) {
    console.error('Failed to get usage summary:', error);
    return {
      totalCost: 0,
      totalCalls: 0,
      recentCost: 0,
      recentCalls: 0,
      modelStats: [],
      avgCostPerCall: 0,
    };
  }
}

/**
 * Generate unique extraction ID for tracking purposes
 */
export function generateExtractionId(): string {
  return `extract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Utility to format cost for display
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/**
 * Utility to format token count for display
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  } else if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}