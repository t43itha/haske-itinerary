'use client'

import { usePathname } from 'next/navigation'

interface ConditionalLayoutProps {
  children: React.ReactNode
}

export default function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname()
  
  // Check if we're on a print route
  const isPrintRoute = pathname?.includes('/print')
  
  // For print routes, return children without header/footer wrapper
  if (isPrintRoute) {
    return <>{children}</>
  }
  
  // For regular routes, return children with header/footer
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center h-16 items-center">
            <h1 className="text-2xl font-bold text-gray-900">
              Haske Itinerary
            </h1>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
      <footer className="mt-auto bg-white border-t">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-600">
            This itinerary is informational and not a travel document.
          </p>
        </div>
      </footer>
    </div>
  )
}