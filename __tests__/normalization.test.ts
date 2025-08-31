import { describe, it, expect, beforeEach, vi } from "vitest"
import { getByFlightNoDate } from "@/lib/providers/aerodatabox"

// Mock environment variables
vi.mock("../lib/env", () => ({
  validateEnv: () => ({
    AERODATABOX_API_KEY: "test-key",
    NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud",
  }),
}))

// Mock date-fns functions for consistent testing
vi.mock("date-fns", () => ({
  parseISO: vi.fn((dateString) => new Date(dateString)),
  format: vi.fn((date, formatStr) => {
    // Mock format to return predictable strings
    if (formatStr === "yyyy-MM-dd HH:mm") {
      return "2024-03-15 10:30"
    }
    return date.toISOString()
  }),
}))

describe("Flight Data Normalization", () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()
    
    // Mock process.env
    vi.stubEnv("AERODATABOX_API_KEY", "test-api-key")
  })

  it("should normalize basic flight data correctly", async () => {
    const mockApiResponse = [{
      flightNumber: "AA123",
      airline: {
        name: "American Airlines",
        iata: "AA"
      },
      aircraft: {
        model: "Boeing 737-800"
      },
      departure: {
        airport: {
          name: "John F. Kennedy International Airport",
          iata: "JFK"
        },
        scheduledTimeUtc: "2024-03-15T14:30:00.000Z",
        terminal: "8",
        gate: "A1"
      },
      arrival: {
        airport: {
          name: "Los Angeles International Airport",
          iata: "LAX"
        },
        scheduledTimeUtc: "2024-03-15T18:45:00.000Z",
        terminal: "3",
        gate: "B22"
      },
      status: "Scheduled"
    }]

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockApiResponse,
    })

    const result = await getByFlightNoDate("AA123", "2024-03-15")
    
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      airline: "American Airlines",
      flightNumber: "AA123",
      aircraft: "Boeing 737-800",
      departure: {
        airport: "John F. Kennedy International Airport",
        code: "JFK",
        scheduledTime: "2024-03-15 10:30",
        terminal: "8",
        gate: "A1",
      },
      arrival: {
        airport: "Los Angeles International Airport", 
        code: "LAX",
        scheduledTime: "2024-03-15 10:30",
        terminal: "3",
        gate: "B22",
      },
      status: "Scheduled",
    })
  })

  it("should handle codeshare flights", async () => {
    const mockApiResponse = [{
      flightNumber: "AA123",
      airline: {
        name: "American Airlines",
        iata: "AA"
      },
      departure: {
        airport: {
          name: "JFK Airport",
          iata: "JFK"
        },
        scheduledTimeUtc: "2024-03-15T14:30:00.000Z"
      },
      arrival: {
        airport: {
          name: "LAX Airport", 
          iata: "LAX"
        },
        scheduledTimeUtc: "2024-03-15T18:45:00.000Z"
      },
      status: "Scheduled",
      codeshares: [
        {
          airline: { name: "British Airways", iata: "BA" },
          flightNumber: "1234"
        },
        {
          airline: { name: "Finnair", iata: "AY" },
          flightNumber: "5678"
        }
      ]
    }]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockApiResponse,
    })

    const result = await getByFlightNoDate("AA123", "2024-03-15")
    
    expect(result[0].codeshares).toEqual(["BA1234", "AY5678"])
  })

  it("should handle actual vs scheduled times", async () => {
    const mockApiResponse = [{
      flightNumber: "DL456",
      airline: {
        name: "Delta Air Lines",
        iata: "DL"
      },
      departure: {
        airport: {
          name: "LaGuardia Airport",
          iata: "LGA"
        },
        scheduledTimeUtc: "2024-03-15T14:30:00.000Z",
        actualTimeUtc: "2024-03-15T14:45:00.000Z"
      },
      arrival: {
        airport: {
          name: "Chicago O'Hare International Airport",
          iata: "ORD"
        },
        scheduledTimeUtc: "2024-03-15T16:30:00.000Z",
        actualTimeUtc: "2024-03-15T16:50:00.000Z"
      },
      status: "Delayed"
    }]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockApiResponse,
    })

    const result = await getByFlightNoDate("DL456", "2024-03-15")
    
    expect(result[0].departure.actualTime).toBe("2024-03-15 10:30")
    expect(result[0].arrival.actualTime).toBe("2024-03-15 10:30")
    expect(result[0].status).toBe("Delayed")
  })

  it("should handle missing optional fields gracefully", async () => {
    const mockApiResponse = [{
      flightNumber: "UA789",
      airline: {
        name: "United Airlines",
        iata: "UA"
      },
      departure: {
        airport: {
          name: "Denver International Airport",
          iata: "DEN"
        },
        scheduledTimeUtc: "2024-03-15T14:30:00.000Z"
        // No terminal, gate, or actual time
      },
      arrival: {
        airport: {
          name: "Seattle-Tacoma International Airport",
          iata: "SEA"
        },
        scheduledTimeUtc: "2024-03-15T16:45:00.000Z"
        // No terminal, gate, or actual time
      },
      status: "Scheduled"
      // No aircraft or codeshares
    }]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockApiResponse,
    })

    const result = await getByFlightNoDate("UA789", "2024-03-15")
    
    expect(result[0]).toMatchObject({
      airline: "United Airlines",
      flightNumber: "UA789",
      aircraft: undefined,
      departure: {
        airport: "Denver International Airport",
        code: "DEN",
        scheduledTime: "2024-03-15 10:30",
        actualTime: undefined,
        terminal: undefined,
        gate: undefined,
      },
      arrival: {
        airport: "Seattle-Tacoma International Airport",
        code: "SEA", 
        scheduledTime: "2024-03-15 10:30",
        actualTime: undefined,
        terminal: undefined,
        gate: undefined,
      },
      status: "Scheduled",
      codeshares: undefined,
    })
  })

  it("should handle API errors gracefully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    })

    await expect(
      getByFlightNoDate("INVALID", "2024-03-15")
    ).rejects.toThrow("Flight INVALID not found for date 2024-03-15")
  })

  it("should handle empty API responses", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    })

    await expect(
      getByFlightNoDate("AA999", "2024-03-15")
    ).rejects.toThrow("No flight data found for AA999 on 2024-03-15")
  })

  it("should handle network errors", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

    await expect(
      getByFlightNoDate("AA123", "2024-03-15")
    ).rejects.toThrow("Network error")
  })

  it("should validate required environment variables", async () => {
    vi.stubEnv("AERODATABOX_API_KEY", "")
    
    await expect(
      getByFlightNoDate("AA123", "2024-03-15")
    ).rejects.toThrow("AERODATABOX_API_KEY is not configured")
  })
})