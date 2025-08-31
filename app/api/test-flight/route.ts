import { NextResponse } from 'next/server'
import { getByFlightNoDate } from '@/lib/providers/aerodatabox'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const flightNo = searchParams.get('flight') || 'AA1'
  const date = searchParams.get('date') || '2024-09-01'

  try {
    console.log(`Testing flight ${flightNo} on ${date}`)
    const result = await getByFlightNoDate(flightNo, date)
    
    return NextResponse.json({
      success: true,
      flightNo,
      date,
      segments: result,
      count: result.length
    })
  } catch (error) {
    console.error('Test flight error:', error)
    
    return NextResponse.json({
      success: false,
      flightNo,
      date,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 400 })
  }
}