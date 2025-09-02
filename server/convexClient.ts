import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) { throw new Error("NEXT_PUBLIC_CONVEX_URL is not set"); }

const convex = new ConvexHttpClient(url);

export async function fetchItinerary(id: string) {
  // Try both shapes; prefer legacy embedded data if it has segments/passengers
  const [legacy, normalized] = await Promise.all([
    convex.query(api.itineraries.get, { id: id as any }).catch(() => null),
    convex.query(api.itineraries.getById, { id: id as any }).catch(() => null),
  ]);
  if (!legacy && !normalized) throw new Error("Itinerary not found");

  const src: any = (legacy && legacy.segments?.length) ? legacy : normalized;
  if (!src) throw new Error("Itinerary not found");
  return src;
}
