import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Haske Itinerary - Print',
  description: 'Flight itinerary print view',
}

export default function PrintLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}