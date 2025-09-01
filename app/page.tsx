import { HomePageContent } from "@/components/home-page-content"
import { searchFlights } from "@/lib/actions"

export default function HomePage() {
  return <HomePageContent onSubmit={searchFlights} />
}