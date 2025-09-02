import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // ensure SSR

// Feature flag: use @react-pdf (true) or HTML→PDF via Puppeteer (false)
const USE_REACT_PDF = process.env.FEATURE_REACT_PDF === "true";

// Legacy @react-pdf renderer
async function generateReactPDF(params: { id: string }) {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("@/convex/_generated/api");
  const { PDFTemplate } = await import("@/components/pdf-template");

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  
  // Fetch itinerary from Convex
  const itinerary = await convex.query(api.itineraries.get, {
    id: params.id as any, // ConvexAPI ID type
  });

  if (!itinerary) {
    return NextResponse.json(
      { error: "Itinerary not found" },
      { status: 404 }
    );
  }

  // Generate PDF buffer
  const pdfBuffer = await renderToBuffer(
    PDFTemplate({ 
      itinerary: {
        id: params.id,
        ...itinerary,
      }
    })
  );

  // Create filename based on itinerary details
  const firstSegment = itinerary.segments[0];
  const displayId = (itinerary as any).humanId || params.id;
  const filename = `haske-itinerary-${firstSegment?.flightNumber || displayId}.pdf`;

  // Return PDF response
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": pdfBuffer.length.toString(),
    },
  });
}

// New HTML→PDF renderer via Puppeteer
async function generateHTMLPDF(params: { id: string }) {
  const chromium = await import("@sparticuz/chromium");
  const url = await import("node:url");

  async function launchBrowser() {
    if (process.env.NETLIFY || process.env.VERCEL) {
      const puppeteer = await import("puppeteer-core");
      return puppeteer.launch({
        args: chromium.default.args,
        defaultViewport: chromium.default.defaultViewport,
        executablePath: await chromium.default.executablePath(),
        headless: true,
      });
    } else {
      const puppeteer = await import("puppeteer");
      return puppeteer.launch({ headless: true });
    }
  }

  const base = process.env.PUBLIC_BASE_URL!;
  const target = new url.URL(`/itineraries/${params.id}/print`, base).toString();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.goto(target, { waitUntil: "networkidle0" });
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
  });
  await browser.close();
  
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Haske-Itinerary-${params.id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (USE_REACT_PDF) {
      return await generateReactPDF(params);
    } else {
      return await generateHTMLPDF(params);
    }
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
