import { z } from "zod"

const envSchema = z.object({
  NEXT_PUBLIC_CONVEX_URL: z.string().url("NEXT_PUBLIC_CONVEX_URL must be a valid URL"),
  AERODATABOX_API_KEY: z.string().min(1, "AERODATABOX_API_KEY is required"),
  GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required for LLM e-ticket parsing").optional(),
  LLM_PROVIDER: z.enum(["groq"]).optional(),
  LLM_MODEL_CHEAP: z.string().optional(),
  LLM_MODEL_BURST: z.string().optional(),
  PARSER_MODE: z.enum(["ai_first", "regex_first"]).default("ai_first"),
})

export function validateEnv() {
  try {
    return envSchema.parse({
      NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
      AERODATABOX_API_KEY: process.env.AERODATABOX_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      LLM_PROVIDER: process.env.LLM_PROVIDER,
      LLM_MODEL_CHEAP: process.env.LLM_MODEL_CHEAP,
      LLM_MODEL_BURST: process.env.LLM_MODEL_BURST,
      PARSER_MODE: process.env.PARSER_MODE,
    })
  } catch (error) {
    console.error("❌ Environment validation failed:")
    
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        console.error(`  ${err.path.join(".")}: ${err.message}`)
      })
    }
    
    throw new Error("Invalid environment configuration")
  }
}

// Helper to get parser mode
export function getParserMode(): "ai_first" | "regex_first" {
  return (process.env.PARSER_MODE as "ai_first" | "regex_first") || "ai_first"
}

// Validate environment variables at startup (server-side only)
if (typeof window === "undefined") {
  validateEnv()
}