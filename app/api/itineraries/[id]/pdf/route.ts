import { NextRequest } from "next/server";
import chromium from "@sparticuz/chromium";
import * as url from "node:url";

export const dynamic = "force-dynamic"; // ensure SSR

async function launchBrowser() {
  if (process.env.NETLIFY || process.env.VERCEL) {
    const puppeteer = await import("puppeteer-core");
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  } else {
    const puppeteer = await import("puppeteer");
    return puppeteer.launch({ headless: true });
  }
}

export async function GET(req: NextRequest, { params }:{ params:{ id:string } }) {
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
