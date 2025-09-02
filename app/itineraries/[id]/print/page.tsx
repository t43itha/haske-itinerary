import "@/app/itineraries/print.css";
import { fetchItinerary } from "@/server/itineraries"; // assumes existing server util
const nbsp = "\u00A0";
const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString("en-GB",{weekday:"short",day:"2-digit",month:"short",year:"numeric"}) : "—";
const fmtTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false}) : "—";

export default async function PrintItinerary({ params }:{ params:{ id:string }}) {
  const itin = await fetchItinerary(params.id);
  const segs = [...(itin.segments||[])].sort((a:any,b:any)=>+new Date(a.dep?.dateTime||0)-+new Date(b.dep?.dateTime||0));
  const [outbound, ret] = groupSegments(segs);
  return (<html lang="en"><body>
    <div className="header">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:"16px"}}>
        <div style={{display:"flex",gap:"12px",alignItems:"center"}}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#D4A574" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M6 12h12M12 6v12" stroke="#0A1628" strokeWidth="1.5" fill="none"/></svg>
          <div>
            <h1 className="brand-title">Haske Global Travel · Flight Itinerary</h1>
            <div className="meta">{itin.agency?.name||"Haske Global Travel"} {nbsp}·{nbsp} {itin.agency?.consultant||"Consultant"} {nbsp}·{nbsp} {itin.agency?.phone||"+44"}</div>
          </div>
        </div>
        <div style={{minWidth:"280px"}}>
          <div className="kv">
            <div>Itinerary ID</div><div>{itin.referenceCode || itin._id}</div>
            <div>Booking Ref</div><div>{itin.refs?.airline || "—"}</div>
            <div>Created</div><div>{fmtDate(itin.createdAt)}</div>
          </div>
          <div className="hr" />
        </div>
      </div>
    </div>
    <div className="container">
      <div className="grid">
        <section className="section">
          <h2>Passengers</h2>
          <table className="table"><thead><tr><th>Name</th><th>Type</th><th>Seat</th></tr></thead>
            <tbody>{(itin.passengers||[]).map((p:any)=>(
              <tr key={p.id||p.fullName}><td>{p.fullName}</td><td className="muted">{p.type||"ADT"}</td><td>{p.seats?.default||"—"}</td></tr>
            ))}</tbody></table>
        </section>
        <section className="section">
          <h2>Booking details</h2>
          <div className="kv">
            <div>Airline locator</div><div>{itin.refs?.airline || "—"}</div>
            <div>Cabin</div><div>{segs[0]?.cabin || "—"}</div>
            <div>Baggage</div><div>{itin.baggage || "—"}</div>
          </div>
          {itin.status && <div style={{marginTop:"8pt"}}><span className="badge badge--ok">{itin.status}</span></div>}
        </section>
      </div>
      {outbound && <LegTable title="Outbound" legs={outbound} />}
      {ret && <LegTable title="Return" legs={ret} />}
      {itin.fareNotes && (<section className="section"><h2>Fare notes & penalties</h2>
        <div style={{border:"1px solid var(--line)",padding:"8pt",whiteSpace:"pre-wrap"}}>{itin.fareNotes}</div>
      </section>)}
    </div>
    <div className="footer"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>This itinerary is informational and not a travel document.</div><div className="page-num"></div></div></div>
  </body></html>); }

function LegTable({ title, legs }:{ title:string; legs:any[] }) {
  const nbsp = "\u00A0";
  return (<section className="section" style={{marginTop:"12pt"}}>
    <h2>{title}</h2>
    <table className="table"><thead>
      <tr><th>Flight</th><th>From</th><th>To</th><th className="t-right">Dep (local)</th><th className="t-right">Arr (local)</th><th>Status</th></tr>
    </thead><tbody>{legs.map((leg:any)=>{
      const plus = leg.arr?.plusOne ? <span className="badge badge--warn">+1 day</span> : null;
      return (<tr key={leg.id||`${leg.marketingFlightNo}-${leg.dep?.dateTime}`}>
        <td><span className="chip">{leg.marketingFlightNo}</span><div className="muted">{leg.equipment?.name||""}</div></td>
        <td><span className="city">{leg.dep?.iata} · {leg.dep?.city||""}</span><div className="muted">T{leg.termGate?.depTerminal||"—"} {leg.termGate?.depGate||""}</div></td>
        <td><span className="city">{leg.arr?.iata} · {leg.arr?.city||""}</span><div className="muted">T{leg.termGate?.arrTerminal||"—"} {leg.termGate?.arrGate||""}</div></td>
        <td className="t-right time">{fmtDate(leg.dep?.dateTime)} {nbsp}{fmtTime(leg.dep?.dateTime)}</td>
        <td className="t-right time">{fmtDate(leg.arr?.dateTime)} {nbsp}{fmtTime(leg.arr?.dateTime)} {plus}</td>
        <td>{leg.status ? <span className="badge badge--ok">{leg.status}</span> : "—"}</td>
      </tr>);})}</tbody></table>
  </section>); }

function groupSegments(segs:any[]){ if(!segs?.length) return [null,null];
  const firstOrigin = segs[0]?.dep?.iata; const finalDest = segs[segs.length-1]?.arr?.iata;
  let split = segs.findIndex((s:any)=> s.arr?.iata===firstOrigin || s.dep?.iata===finalDest);
  if (split<=0) split = Math.floor(segs.length/2);
  return [segs.slice(0, split+1), segs.slice(split+1)];
}