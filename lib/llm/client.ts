import Groq from 'groq-sdk';

// Initialize Groq client lazily
let groq: Groq | null = null;

export function getGroqClient(): Groq {
  if (!groq && process.env.GROQ_API_KEY) {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  
  if (!groq) {
    throw new Error('Groq client not initialized - API key not provided');
  }
  
  return groq;
}

// Model configuration
export const MODELS = {
  CHEAP: process.env.LLM_MODEL_CHEAP || 'llama-3.1-8b-instant',
  BURST: process.env.LLM_MODEL_BURST || 'llama-3.1-70b-versatile',
} as const;

export type ModelType = keyof typeof MODELS;

// Pricing per 1M tokens (in USD) - Groq pricing as of 2024
export const PRICING = {
  'llama-3.1-8b-instant': { 
    input: 0.05, 
    output: 0.08 
  },
  'llama-3.1-70b-versatile': { 
    input: 0.59, 
    output: 0.79 
  },
} as const;

export function calculateCost(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = PRICING[model as keyof typeof PRICING];
  if (!pricing) {
    console.warn(`Unknown model pricing for ${model}, using fallback`);
    return 0;
  }
  
  return (tokensIn * pricing.input + tokensOut * pricing.output) / 1_000_000;
}

export function isGroqConfigured(): boolean {
  return !!(process.env.GROQ_API_KEY && process.env.LLM_PROVIDER === 'groq');
}