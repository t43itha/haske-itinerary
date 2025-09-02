import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function fetchItinerary(id: string) {
  const data = await convex.query(api.itineraries.getById, { id: id as any });
  if (!data) throw new Error("Itinerary not found");
  return data;
}