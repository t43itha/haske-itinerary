export type ParsedTicket = {
  carrier: string;                       // "BA"
  airlineLocator?: string;               // "ZL75AO"
  passengers: Array<{ fullName: string; type?: "ADT"|"CHD"|"INF" }>;
  tickets?: Array<{ number: string; paxName: string; validUntil?: string }>; // "125-2214424598"
  baggage?: string;                      // "2 bags at 23kg"
  segments: Array<{
    marketingFlightNo: string;           // "BA0078"
    cabin?: string;                      // "World Traveller" => "ECONOMY"
    bookingClass?: string;               // if present
    mealService?: string;                // "Meal" | "Food and Beverages for Purchase"
    dep: { iata?: string; city?: string; terminal?: string; timeLocal?: string; date?: string };
    arr: { iata?: string; city?: string; terminal?: string; timeLocal?: string; date?: string };
  }>;
  payments?: { currency: string; total: number; method?: string }[];
  fareDetails?: {                        // Detailed fare breakdown
    baseFare?: number;
    currency?: string;
    carrierCharges?: number;
    taxes?: Array<{ type: string; amount: number; description?: string }>;
    total?: number;
  };
  fareNotes?: string;                    // endorsements/penalties text
  iataNumber?: string;                   // Travel agency IATA number
  handBaggage?: string;                  // "1 handbag/laptop bag, plus 1 additional cabin bag"
  raw: { text?: string; html?: string }; // for audit
}

// BA cabin mapping constants
export const BA_CABIN_MAP: Record<string, string> = {
  "World Traveller": "ECONOMY",
  "Euro Traveller": "ECONOMY",
  "World Traveller Plus": "PREMIUM_ECONOMY",
  "Club Europe": "BUSINESS",
  "Club World": "BUSINESS",
  "First": "FIRST"
};

// Generic cabin mapping for other carriers
export const GENERIC_CABIN_MAP: Record<string, string> = {
  "Economy": "ECONOMY",
  "Premium Economy": "PREMIUM_ECONOMY",
  "Business": "BUSINESS",
  "First": "FIRST",
  "First Class": "FIRST"
};

// Standard passenger type mapping
export const PAX_TYPE_MAP: Record<string, "adult" | "child" | "infant"> = {
  "ADT": "adult",
  "CHD": "child", 
  "INF": "infant"
};