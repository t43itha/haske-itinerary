import { z } from "zod"

const envSchema = z.object({
  NEXT_PUBLIC_CONVEX_URL: z.string().url("NEXT_PUBLIC_CONVEX_URL must be a valid URL"),
  AERODATABOX_API_KEY: z.string().min(1, "AERODATABOX_API_KEY is required"),
})

export function validateEnv() {
  try {
    return envSchema.parse({
      NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
      AERODATABOX_API_KEY: process.env.AERODATABOX_API_KEY,
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

// Validate environment variables at startup (server-side only)
if (typeof window === "undefined") {
  validateEnv()
}