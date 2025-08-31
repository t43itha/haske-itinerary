import { vi } from "vitest"

// Mock Next.js modules
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

// Setup global fetch mock
global.fetch = vi.fn()

// Mock environment variables
process.env.NEXT_PUBLIC_CONVEX_URL = "https://test.convex.cloud"
process.env.AERODATABOX_API_KEY = "test-api-key"