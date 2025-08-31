import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { ConvexHttpClient } from "convex/browser"
import { api } from "@/convex/_generated/api"
import { PDFTemplate } from "@/components/pdf-template"

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Fetch itinerary from Convex
    const itinerary = await convex.query(api.itineraries.get, {
      id: params.id as any, // ConvexAPI ID type
    })

    if (!itinerary) {
      return NextResponse.json(
        { error: "Itinerary not found" },
        { status: 404 }
      )
    }

    // Generate PDF buffer
    const pdfBuffer = await renderToBuffer(
      PDFTemplate({ 
        itinerary: {
          id: params.id,
          ...itinerary,
        }
      })
    )

    // Create filename based on itinerary details
    const firstSegment = itinerary.segments[0]
    const filename = `haske-itinerary-${firstSegment?.flightNumber || params.id}.pdf`

    // Return PDF response
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error("PDF generation error:", error)
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    )
  }
}