import { NextRequest } from "next/server";
import chromium from "@sparticuz/chromium";

export const dynamic = "force-dynamic";

async function launchBrowser() {
  const isNetlify = Boolean(process.env.NETLIFY || process.env.VERCEL || process.env.AWS_REGION);

  if (isNetlify) {
    const puppeteer = await import("puppeteer-core");
    
    // Configure chromium args for serverless environment
    const args = [
      ...chromium.args,
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-setuid-sandbox",
      "--no-first-run",
      "--no-sandbox",
      "--no-zygote",
      "--single-process",
      "--font-render-hinting=none"
    ];
    
    return puppeteer.launch({
      args,
      defaultViewport: { width: 1280, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  } else {
    const puppeteer = await import("puppeteer");
    return puppeteer.launch({ headless: true });
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Use PUBLIC_BASE_URL from env, fallback to PDF_PUBLIC_BASE_URL or request origin
    const base = process.env.PUBLIC_BASE_URL || process.env.PDF_PUBLIC_BASE_URL || (() => {
      try { 
        return new URL(req.url).origin; 
      } catch { 
        return 'http://localhost:3000'; 
      }
    })();
    
    const reqUrl = new URL(req.url);
    const style = reqUrl.searchParams.get("style") || "bleed";   // pass-through for print variations
    const target = new URL(`/itineraries/${params.id}/print?style=${style}`, base).toString();

    console.log(`PDF Generation - Base URL: ${base}, Target: ${target}`);

    let browser;
    try {
      browser = await launchBrowser();
      const page = await browser.newPage();

      // Be explicit: Netlify needs absolute URLs for assets
      await page.setBypassCSP(true);
      await page.setCacheEnabled(false);
      await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36");

      await page.goto(target, { waitUntil: "networkidle0", timeout: 60_000 });
      await page.emulateMediaType("print");

      // wait for your sentinel
      await page.waitForSelector('#pdf-ready[data-status="ok"]', { timeout: 10_000 });

      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: `<div></div>`,
        footerTemplate: `
          <div style="font-size:8px;color:#666;width:100%;padding:8px 14mm;
                      display:flex;justify-content:space-between;align-items:center;">
            <div>This itinerary is informational and not a travel document.</div>
            <div><span class="pageNumber"></span> / <span class="totalPages"></span></div>
          </div>`,
        margin: { top: "18mm", right: "14mm", bottom: "60px", left: "14mm" },
      });

      const asAttachment = reqUrl.searchParams.get("dl") === "1";
      const firstSegmentId = params.id.slice(0, 8);
      
      return new Response(Buffer.from(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${asAttachment ? "attachment" : "inline"}; filename="Haske-Itinerary-${firstSegmentId}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  } catch (error) {
    console.error("PDF generation error:", error);
    
    // Fallback to React-PDF if available and configured
    if (process.env.FEATURE_REACT_PDF === "true") {
      try {
        console.log("Attempting React-PDF fallback...");
        return await generateReactPDFFallback(params);
      } catch (fallbackError) {
        console.error("React-PDF fallback also failed:", fallbackError);
      }
    }
    
    return new Response(
      JSON.stringify({ 
        error: "Failed to generate PDF", 
        details: error instanceof Error ? error.message : String(error) 
      }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}

// Optional React-PDF fallback (only if FEATURE_REACT_PDF is enabled)
async function generateReactPDFFallback(params: { id: string }) {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("@/convex/_generated/api");
  const { PDFTemplate } = await import("@/components/pdf-template");

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  
  // Fetch itinerary from Convex
  const [legacyDoc, normalizedDoc] = await Promise.all([
    convex.query(api.itineraries.get, { id: params.id as any }).catch(() => null),
    convex.query(api.itineraries.getById, { id: params.id as any }).catch(() => null),
  ]);

  if (!legacyDoc && !normalizedDoc) {
    return new Response(
      JSON.stringify({ error: "Itinerary not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Bridge: map Convex records into PDF template shape
  function toPassengerList(src: any): Array<{ name: string; type: "adult"|"child"|"infant" }> {
    if (!src) return [];
    if (src.length && src[0]?.name) return src as any;
    const mapType = (t?: string): "adult" | "child" | "infant" => (t === 'CHD' ? 'child' : t === 'INF' ? 'infant' : 'adult');
    return (src as any[]).map(p => ({ name: p.fullName || p.name || 'Passenger', type: mapType(p.type) }));
  }

  function toSegments(src: any): Array<any> {
    if (!src) return [];
    if (src.length && src[0]?.flightNumber && src[0]?.departure?.code) return src as any;
    return (src as any[]).map(seg => ({
      airline: seg.airline || (seg.marketingFlightNo ? seg.marketingFlightNo.slice(0, 2) : 'XX'),
      flightNumber: seg.marketingFlightNo || seg.flightNumber || '—',
      aircraft: seg.equipment?.name,
      departure: {
        airport: seg.dep?.city || seg.dep?.iata || 'Unknown',
        code: seg.dep?.iata || '—',
        scheduledTime: seg.dep?.dateTime || new Date().toISOString(),
        terminal: seg.termGate?.depTerminal,
        gate: seg.termGate?.depGate,
      },
      arrival: {
        airport: seg.arr?.city || seg.arr?.iata || 'Unknown',
        code: seg.arr?.iata || '—',
        scheduledTime: seg.arr?.dateTime || new Date().toISOString(),
        terminal: seg.termGate?.arrTerminal,
        gate: seg.termGate?.arrGate,
      },
      status: seg.status || 'Confirmed',
    }));
  }

  const source = (legacyDoc && (legacyDoc as any).segments?.length) ? legacyDoc : normalizedDoc;

  const pdfItinerary = {
    id: params.id,
    humanId: (source as any)?.humanId || (source as any)?.referenceCode,
    passengers: toPassengerList((source as any)?.passengers),
    segments: toSegments((source as any)?.segments),
    createdAt: ((): string => {
      const v = (source as any)?.createdAt;
      if (!v) return new Date().toISOString();
      return typeof v === 'number' ? new Date(v).toISOString() : v;
    })(),
    bookingExtras: ((): any => {
      const be = (source as any)?.bookingExtras || {};
      const refs = (source as any)?.refs || {};
      const top = source as any;
      return {
        airlineLocator: be.airlineLocator || refs.airline,
        baggage: be.baggage || top.baggage,
        handBaggage: be.handBaggage,
        ticketNumbers: be.ticketNumbers,
        fareDetails: be.fareDetails,
        fareNotes: be.fareNotes || top.fareNotes,
      };
    })(),
  } as any;

  // Generate PDF buffer
  const pdfBuffer = await renderToBuffer(PDFTemplate({ itinerary: pdfItinerary }));

  const firstSegment = pdfItinerary.segments?.[0];
  const displayId = pdfItinerary.humanId || params.id.slice(0, 8);
  const filename = `haske-itinerary-${firstSegment?.flightNumber || displayId}.pdf`;

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": pdfBuffer.length.toString(),
      "X-Renderer": "react-pdf-fallback",
    },
  });
}