// CSS is loaded via link tag in head
import { fetchItinerary } from "@/server/convexClient";
const nbsp = "\u00A0";
const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString("en-GB",{weekday:"short",day:"2-digit",month:"short",year:"numeric"}) : "—";
const fmtTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false}) : "—";

export default async function PrintItinerary({ params }:{ params:{ id:string }}) {
  try {
    const itinRaw = await fetchItinerary(params.id);
    // Bridge: normalize legacy-embedded docs to print-friendly shape
    const toNormSeg = (s:any) => ({
      marketingFlightNo: s.marketingFlightNo || s.flightNumber || '—',
      dep: {
        iata: s.dep?.iata || s.departure?.code || '—',
        city: s.dep?.city || s.departure?.airport,
        dateTime: s.dep?.dateTime || s.departure?.scheduledTime,
      },
      arr: {
        iata: s.arr?.iata || s.arrival?.code || '—',
        city: s.arr?.city || s.arrival?.airport,
        dateTime: s.arr?.dateTime || s.arrival?.scheduledTime,
      },
      termGate: s.termGate || {
        depTerminal: s.departure?.terminal,
        depGate: s.departure?.gate,
        arrTerminal: s.arrival?.terminal,
        arrGate: s.arrival?.gate,
      },
      equipment: s.equipment || (s.aircraft ? { name: s.aircraft } : undefined),
      cabin: s.cabin,
      status: s.status,
    });

    const itin:any = {
      ...itinRaw,
      passengers: (itinRaw as any)?.passengers?.map((p:any)=> ({
        fullName: p.fullName || p.name,
        type: p.type || 'ADT',
      })) || [],
      segments: (itinRaw as any)?.segments?.map((s:any)=> toNormSeg(s)) || [],
      refs: (itinRaw as any)?.refs || { airline: (itinRaw as any)?.bookingExtras?.airlineLocator },
      baggage: (itinRaw as any)?.baggage || (itinRaw as any)?.bookingExtras?.baggage,
    };
    
    const AGENCY = {
      name: itin.agency?.name ?? "Haske Global Travel Ltd",
      consultant: itin.agency?.consultant ?? "Eugene Owusu Afram Jnr",
      phone: itin.agency?.phone ?? "+44",
      email: itin.agency?.email ?? "info@haskeglobaltravel.com",
      website: itin.agency?.website ?? "www.haskeglobaltravel.com",
      phoneAlt: itin.agency?.phoneAlt ?? "UK: +442081911882 · GH: +233 535703324",
      locations: itin.agency?.locations ?? "Accra · London · Dubai",
    };
    
    // Defensive check for missing itinerary data
    if (!itin) {
      return (
        <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <title>Haske Itinerary - Not Found</title>
          </head>
          <body style={{padding: "20px", fontFamily: "system-ui"}}>
            <h1>Itinerary not found</h1>
            <p>ID: {params.id}</p>
            <p>Check <code>NEXT_PUBLIC_CONVEX_URL</code> and database records.</p>
            <div id="pdf-ready" data-status="error" />
          </body>
        </html>
      );
    }
  
    const segs = [...(itin.segments||[])].sort((a:any,b:any)=>+new Date(a.dep?.dateTime||0)-+new Date(b.dep?.dateTime||0));
    const [outbound, ret] = groupSegments(segs);
    
    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <title>Haske Itinerary</title>
          <link rel="stylesheet" href="/print.css" />
        </head>
        <body>
          <div className="page">
            {/* Header bar */}
            <div className="brand-header" style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
              {/* LEFT: logo above title and contact (left aligned) */}
              <div style={{ textAlign: "left", flex: "1 1 auto" }}>
                <img src="/haske-logo.png" alt="Haske Global Travel" width={140} height={36} style={{ marginBottom: "8px" }} />
                <h1 className="brand-title" style={{ margin: 0 }}>Haske Itinerary</h1>
                <div className="brand-header__contacts">
                  {AGENCY.consultant}<br/>
                  {AGENCY.name}<br/>
                  {AGENCY.website} · {AGENCY.email}<br/>
                  {AGENCY.phoneAlt}<br/>
                  {AGENCY.locations}
                </div>
              </div>

              {/* RIGHT: key facts */}
              <div style={{ flex: "0 0 auto", maxWidth: "260px", overflow: "hidden" }}>
                <div className="kv">
                  <div>Itinerary ID</div><div>{itin.humanId || (itin as any)._id}</div>
                  <div>Booking Ref</div><div>{itin.refs?.airline || "—"}</div>
                  <div>Created</div><div>{fmtDate(itin.createdAt as any)}</div>
                </div>
                {/* remove any <div className="hr" /> here */}
              </div>
            </div>


            {/* Main content */}
            <main className="container">
            <div className="grid">
              <section className="section">
                <h2>Passengers</h2>
                <table className="table">
                  <thead>
                    <tr><th>Name</th><th>Type</th><th>Seat</th></tr>
                  </thead>
                  <tbody>
                    {(itin.passengers || []).length
                      ? itin.passengers.map((p:any) => (
                          <tr key={p.id || p.fullName}>
                            <td>{p.fullName}</td>
                            <td className="muted">{(p.type==='adult'?'ADT':p.type==='child'?'CHD':p.type==='infant'?'INF':p.type) || "ADT"}</td>
                            <td>{p.seats?.default || "—"}</td>
                          </tr>
                        ))
                      : <tr><td colSpan={3} className="muted">No passengers on record</td></tr>
                    }
                  </tbody>
                </table>
              </section>
              <section className="section">
                <h2>Booking details</h2>
                <div className="kv">
                  <div>Airline locator</div><div>{itin.refs?.airline || "—"}</div>
                  <div>Cabin</div><div>{segs[0]?.cabin || "—"}</div>
                  <div>Baggage</div><div>{itin.baggage || itin.bookingExtras?.baggage || "—"}</div>
                </div>
                {itin.status && <div style={{marginTop:"8pt"}}><span className="badge badge--ok">{itin.status}</span></div>}
              </section>
            </div>
              {outbound && <LegTable title="Outbound" legs={outbound} />}
              {ret && <LegTable title="Return" legs={ret} />}
              {itin.fareNotes && (
                <section className="section">
                  <h2>Fare notes & penalties</h2>
                  <div style={{border:"1px solid var(--line)",padding:"8pt",whiteSpace:"pre-wrap"}}>{itin.fareNotes}</div>
                </section>
              )}
              <div id="pdf-ready" data-status="ok" />
            </main>
          </div>
        </body>
      </html>
    );
  } catch (error) {
    console.error('Print page error:', error);
    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <title>Haske Itinerary - Error</title>
        </head>
        <body style={{padding: "20px", fontFamily: "system-ui"}}>
          <h1>Error loading itinerary</h1>
          <p>ID: {params.id}</p>
          <p>Error: {error instanceof Error ? error.message : 'Unknown error'}</p>
          <div id="pdf-ready" data-status="error" />
        </body>
      </html>
    );
  }
}

function LegTable({ title, legs }:{ title:string; legs:any[] }) {
  const nbsp = "\u00A0";
  return (
    <section className="section" style={{marginTop:"12pt"}}>
      <h2>{title}</h2>
      <table className="table">
        <thead>
          <tr><th>Flight</th><th>From</th><th>To</th><th className="t-right">Dep (local)</th><th className="t-right">Arr (local)</th><th>Status</th></tr>
        </thead>
        <tbody>
          {legs.length
            ? legs.map((leg:any)=>{
                const plus = leg.arr?.plusOne ? <span className="badge badge--warn">+1 day</span> : null;
                return (
                  <tr key={leg.id||`${leg.marketingFlightNo}-${leg.dep?.dateTime}`}>
                    <td><span className="chip">{leg.marketingFlightNo}</span><div className="muted">{leg.equipment?.name||""}</div></td>
                    <td>
                      <span className="city">{leg.dep?.iata} · {leg.dep?.city || ""}</span>
                      <div className="muted">
                        {leg.termGate?.depTerminal ? `Terminal ${leg.termGate.depTerminal}` : ""}
                        {leg.termGate?.depGate ? ` / Gate ${leg.termGate.depGate}` : ""}
                      </div>
                    </td>
                    <td>
                      <span className="city">{leg.arr?.iata} · {leg.arr?.city || ""}</span>
                      <div className="muted">
                        {leg.termGate?.arrTerminal ? `Terminal ${leg.termGate.arrTerminal}` : ""}
                        {leg.termGate?.arrGate ? ` / Gate ${leg.termGate.arrGate}` : ""}
                      </div>
                    </td>
                    <td className="t-right time">{fmtDate(leg.dep?.dateTime)} {nbsp}{fmtTime(leg.dep?.dateTime)}</td>
                    <td className="t-right time">{fmtDate(leg.arr?.dateTime)} {nbsp}{fmtTime(leg.arr?.dateTime)} {plus}</td>
                    <td>{leg.status ? <span className="badge badge--ok">{leg.status}</span> : "—"}</td>
                  </tr>
                );
              })
            : <tr><td colSpan={6} className="muted">No flight segments</td></tr>
          }
        </tbody>
      </table>
    </section>
  );
}

function groupSegments(segs:any[]){ 
  if(!segs?.length) return [null,null];
  const firstOrigin = segs[0]?.dep?.iata; 
  const finalDest = segs[segs.length-1]?.arr?.iata;
  let split = segs.findIndex((s:any)=> s.arr?.iata===firstOrigin || s.dep?.iata===finalDest);
  if (split<=0) split = Math.floor(segs.length/2);
  return [segs.slice(0, split+1), segs.slice(split+1)];
}
