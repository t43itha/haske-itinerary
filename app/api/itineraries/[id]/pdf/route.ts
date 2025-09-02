import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // ensure SSR
export const runtime = "nodejs"; // ensure Node runtime for Puppeteer/Chromium

// Feature flag: use @react-pdf (true) or HTML→PDF via Puppeteer (false)
const USE_REACT_PDF = process.env.FEATURE_REACT_PDF === "true";

// Legacy @react-pdf renderer (now with schema bridging)
async function generateReactPDF(params: { id: string }) {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("@/convex/_generated/api");
  const { PDFTemplate } = await import("@/components/pdf-template");

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  
  // Fetch itinerary from Convex (support both legacy embedded + normalized schema)
  const [legacyDoc, normalizedDoc] = await Promise.all([
    convex.query(api.itineraries.get, { id: params.id as any }).catch(() => null),
    convex.query(api.itineraries.getById, { id: params.id as any }).catch(() => null),
  ]);

  if (!legacyDoc && !normalizedDoc) {
    return NextResponse.json(
      { error: "Itinerary not found" },
      { status: 404 }
    );
  }

  // Bridge: map Convex records into PDF template shape
  function toPassengerList(src: any): Array<{ name: string; type: "adult"|"child"|"infant" }> {
    if (!src) return [];
    // Legacy embedded passengers already match
    if (src.length && src[0]?.name) return src as any;
    // Normalized passengers
    const mapType = (t?: string): "adult" | "child" | "infant" => (t === 'CHD' ? 'child' : t === 'INF' ? 'infant' : 'adult');
    return (src as any[]).map(p => ({ name: p.fullName || p.name || 'Passenger', type: mapType(p.type) }));
  }

  function toSegments(src: any): Array<any> {
    if (!src) return [];
    // Legacy embedded segments already match FlightSegment
    if (src.length && src[0]?.flightNumber && src[0]?.departure?.code) return src as any;
    // Normalized segments -> FlightSegment
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

  // Create filename based on itinerary details
  const firstSegment = pdfItinerary.segments?.[0];
  const displayId = pdfItinerary.humanId || params.id;
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
async function generateHTMLPDF(req: NextRequest, params: { id: string }) {
  const chromium = await import("@sparticuz/chromium");
  const url = await import("node:url");

  function computeBase(req: NextRequest) {
    const origin = (() => { try { return new URL(req.url).origin; } catch { return null; } })();
    const fromEnv = process.env.PDF_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || undefined;
    // In development, always use the request origin (localhost) to avoid cross-deployment mismatches
    if (process.env.NODE_ENV !== 'production' && origin) return origin;
    // In production, prefer configured public base URL; otherwise fall back to origin
    return fromEnv || origin || 'http://localhost:3000';
  }

  async function launchBrowser() {
    try {
      if (process.env.NETLIFY || process.env.VERCEL) {
        const puppeteer = await import("puppeteer-core");
        const execPath = await chromium.default.executablePath();
        return puppeteer.launch({
          args: chromium.default.args,
          defaultViewport: { width: 1280, height: 800 },
          executablePath: execPath,
          headless: true,
        });
      } else {
        const puppeteer = await import("puppeteer");
        return puppeteer.launch({ headless: true });
      }
    } catch (e) {
      throw new Error(`Failed to launch browser: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const base = computeBase(req);
  const target = new url.URL(`/itineraries/${params.id}/print`, base).toString();

  let browser: any;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.emulateMediaType('print');
    const waitUntil = process.env.NODE_ENV !== 'production' ? 'domcontentloaded' : 'networkidle0';
    await page.goto(target, { waitUntil: waitUntil as any, timeout: 30000 });
    await page.waitForSelector('#pdf-ready[data-status="ok"]', { timeout: 20000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="font-size:8px;color:#666;width:100%;padding:8px 14mm;
                    display:flex;justify-content:flex-end;align-items:center;">
          <div><span class="pageNumber"></span> / <span class="totalPages"></span></div>
        </div>`,
      margin: { top: "18mm", right: "14mm", bottom: "60px", left: "14mm" }
    });

    // Support ?dl=1 to force "Save as" download
    const { searchParams } = new URL(req.url);
    const asAttachment = searchParams.get("dl") === "1";

    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${asAttachment ? "attachment" : "inline"}; filename="Haske-Itinerary-${params.id}.pdf"`,
        "Cache-Control": "no-store",
        "X-Renderer": "html",
      },
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (USE_REACT_PDF) {
      const res = await generateReactPDF(params);
      // Attach marker header to help debugging which renderer produced the PDF
      res.headers.set("X-Renderer", "react");
      return res;
    }
    try {
      return await generateHTMLPDF(req, params);
    } catch (htmlErr) {
      console.error("HTML→PDF failed, falling back to React-PDF:", htmlErr);
      return await generateReactPDF(params);
    }
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
