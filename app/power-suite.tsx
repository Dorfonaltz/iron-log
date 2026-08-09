"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Sex = "male" | "female";
type PersonalRecord = { weight: number; reps: number; date: string };
type RecordMap = Record<string, PersonalRecord>;
type AthleteProfile = { bodyweight: number; sex: Sex };
type PrHistoryMap = Record<string, PersonalRecord[]>;
type SbdPoint = { date: string; total: number };
type PowerState = { profile: AthleteProfile; prHistory: PrHistoryMap; sbdHistory: SbdPoint[] };
type Attempt = { weight: string; status: "pending" | "good" | "miss" };
type MainState = { plan: unknown[]; records: RecordMap; history: unknown[] };
type PowerTab = "dashboard" | "history" | "competition";

const MAIN_LIFTS = [
  { key: "Agachamento livre", label: "Agachamento", code: "S" },
  { key: "Supino reto (barra)", label: "Supino", code: "B" },
  { key: "Levantamento terra convencional", label: "Terra", code: "D" },
] as const;
const MAIN_SYNC_KEY = "iron-log-sync-key";
const RECORD_STORAGE = "meu-treino-records";
const PLAN_STORAGE = "meu-treino-plan";
const HISTORY_STORAGE = "meu-treino-history";
const POWER_STORAGE = "iron-log-power-state-v1";
const EMPTY: PowerState = { profile: { bodyweight: 0, sex: "male" }, prHistory: {}, sbdHistory: [] };

function key32(value: string) { return value.replace(/[^a-fA-F0-9]/g, "").toUpperCase(); }
function isRecord(value: unknown): value is PersonalRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PersonalRecord>;
  return typeof row.weight === "number" && row.weight > 0 && typeof row.reps === "number" && row.reps > 0 && typeof row.date === "string";
}
function readRecords(): RecordMap {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORD_STORAGE) ?? "{}") as Record<string, unknown>;
    const result: RecordMap = {};
    Object.entries(raw).forEach(([name, value]) => { if (isRecord(value)) result[name] = value; });
    return result;
  } catch { return {}; }
}
function readMain(): MainState {
  try {
    const plan = JSON.parse(localStorage.getItem(PLAN_STORAGE) ?? "[]") as unknown[];
    const history = JSON.parse(localStorage.getItem(HISTORY_STORAGE) ?? "[]") as unknown[];
    return { plan: Array.isArray(plan) ? plan : [], records: readRecords(), history: Array.isArray(history) ? history : [] };
  } catch { return { plan: [], records: readRecords(), history: [] }; }
}
function isPower(value: unknown): value is PowerState {
  if (!value || typeof value !== "object") return false;
  const x = value as Partial<PowerState>;
  return !!x.profile && (x.profile.sex === "male" || x.profile.sex === "female") && typeof x.profile.bodyweight === "number" && !!x.prHistory && typeof x.prHistory === "object" && Array.isArray(x.sbdHistory);
}
function loadLocal(): PowerState {
  try { const x = JSON.parse(localStorage.getItem(POWER_STORAGE) ?? "null") as unknown; return isPower(x) ? x : EMPTY; }
  catch { return EMPTY; }
}
function dedupeRecords(rows: PersonalRecord[]) {
  const map = new Map<string, PersonalRecord>();
  rows.forEach((row) => map.set(`${row.date}|${row.weight}|${row.reps}`, row));
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-60);
}
function dedupeSbd(rows: SbdPoint[]) {
  const map = new Map<string, SbdPoint>();
  rows.forEach((row) => map.set(`${row.date}|${row.total}`, row));
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-80);
}
function mergePower(a: PowerState, b: PowerState): PowerState {
  const prHistory: PrHistoryMap = {};
  new Set([...Object.keys(a.prHistory), ...Object.keys(b.prHistory)]).forEach((name) => {
    prHistory[name] = dedupeRecords([...(a.prHistory[name] ?? []), ...(b.prHistory[name] ?? [])]);
  });
  return { profile: b.profile.bodyweight > 0 ? b.profile : a.profile, prHistory, sbdHistory: dedupeSbd([...a.sbdHistory, ...b.sbdHistory]) };
}
async function powerKey(mainKey: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`IRON-LOG-POWER:${mainKey}`)));
  return Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}
function totalOf(records: RecordMap) { return MAIN_LIFTS.reduce((sum, lift) => sum + (records[lift.key]?.weight ?? 0), 0); }
function enrich(base: PowerState, records: RecordMap): PowerState {
  let changed = false;
  const prHistory = { ...base.prHistory };
  MAIN_LIFTS.forEach((lift) => {
    const record = records[lift.key]; if (!record) return;
    const rows = prHistory[lift.key] ?? [];
    if (!rows.some((row) => row.date === record.date && row.weight === record.weight && row.reps === record.reps)) {
      prHistory[lift.key] = dedupeRecords([...rows, record]); changed = true;
    }
  });
  const total = totalOf(records);
  let sbdHistory = base.sbdHistory;
  if (total > 0 && sbdHistory.at(-1)?.total !== total) {
    const dates = MAIN_LIFTS.map((lift) => records[lift.key]?.date).filter((d): d is string => !!d).sort();
    sbdHistory = dedupeSbd([...sbdHistory, { date: dates.at(-1) ?? new Date().toISOString(), total }]); changed = true;
  }
  return changed ? { ...base, prHistory, sbdHistory } : base;
}
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function dots(bodyweight: number, total: number, sex: Sex) {
  if (bodyweight <= 0 || total <= 0) return 0;
  const bw = clamp(bodyweight, 40, sex === "male" ? 210 : 150);
  const [a,b,c,d,e] = sex === "male" ? [-0.000001093,0.0007391293,-0.1918759221,24.0900756,-307.75076] : [-0.0000010706,0.0005158568,-0.1126655495,13.6175032,-57.96288];
  const denominator = a*bw**4 + b*bw**3 + c*bw**2 + d*bw + e;
  return denominator > 0 ? 500 / denominator * total : 0;
}
function wilks(bodyweight: number, total: number, sex: Sex) {
  if (bodyweight <= 0 || total <= 0) return 0;
  const bw = sex === "male" ? clamp(bodyweight, 40, 201.9) : clamp(bodyweight, 26.51, 154.53);
  const [a,b,c,d,e,f] = sex === "male" ? [-216.0475144,16.2606339,-0.002388645,-0.00113732,0.00000701863,-0.00000001291] : [594.31747775582,-27.23842536447,0.82112226871,-0.00930733913,0.00004731582,-0.00000009054];
  const denominator = a + b*bw + c*bw**2 + d*bw**3 + e*bw**4 + f*bw**5;
  return denominator > 0 ? 500 / denominator * total : 0;
}
function graph(history: SbdPoint[]) {
  const rows = history.slice(-12); if (!rows.length) return [] as {x:number;y:number;total:number}[];
  const min = Math.min(...rows.map((x) => x.total)), max = Math.max(...rows.map((x) => x.total)), range = Math.max(1, max-min);
  return rows.map((row, i) => ({ x: rows.length === 1 ? 160 : 18 + i/(rows.length-1)*284, y: 118 - (row.total-min)/range*86, total: row.total }));
}
function dateLabel(date: string) { return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); }

export default function PowerSuite() {
  const [open,setOpen] = useState(false), [tab,setTab] = useState<PowerTab>("dashboard");
  const [power,setPower] = useState<PowerState>(EMPTY), [records,setRecords] = useState<RecordMap>({});
  const [status,setStatus] = useState<"local"|"syncing"|"synced"|"offline">("local");
  const [weight,setWeight] = useState(""), [sex,setSex] = useState<Sex>("male");
  const [lift,setLift] = useState<string>(MAIN_LIFTS[0].key);
  const [attempts,setAttempts] = useState<Attempt[]>(Array.from({length:3},()=>({weight:"",status:"pending"})));
  const [message,setMessage] = useState("");
  const ref = useRef(power), busy = useRef(false);
  function apply(next: PowerState) { ref.current = next; setPower(next); localStorage.setItem(POWER_STORAGE, JSON.stringify(next)); }
  async function sync(next: PowerState) {
    if (busy.current) return;
    const mainKey = key32(localStorage.getItem(MAIN_SYNC_KEY) ?? ""); if (mainKey.length !== 32) { setStatus("local"); return; }
    busy.current = true; setStatus("syncing");
    try {
      const key = await powerKey(mainKey);
      const get = await fetch("/api/state", { cache: "no-store", headers: { "x-iron-sync-key": key } });
      let merged = next;
      if (get.ok) { const data = await get.json() as {state:{records?:{powerState?:unknown}}|null}; const remote = data.state?.records?.powerState; if (isPower(remote)) merged = mergePower(next,remote); }
      const put = await fetch("/api/state", { method:"PUT", headers:{"content-type":"application/json","x-iron-sync-key":key}, body:JSON.stringify({plan:[],records:{powerState:merged},history:[]}) });
      if (!put.ok) throw new Error("sync"); if (JSON.stringify(merged) !== JSON.stringify(ref.current)) apply(merged); setStatus("synced");
    } catch { setStatus("offline"); } finally { busy.current = false; }
  }
  function save(next: PowerState) { apply(next); void sync(next); }
  useEffect(() => {
    const local = enrich(loadLocal(), readRecords()); apply(local); setRecords(readRecords()); setWeight(local.profile.bodyweight ? String(local.profile.bodyweight) : ""); setSex(local.profile.sex);
    const starter = window.setTimeout(() => void sync(local), 500);
    const timer = window.setInterval(() => { const latest = readRecords(); setRecords(latest); const next = enrich(ref.current, latest); if (next !== ref.current) save(next); }, 1500);
    return () => { clearTimeout(starter); clearInterval(timer); };
  }, []);
  const total = useMemo(()=>totalOf(records),[records]), dotsValue = useMemo(()=>dots(power.profile.bodyweight,total,power.profile.sex),[power.profile,total]), wilksValue = useMemo(()=>wilks(power.profile.bodyweight,total,power.profile.sex),[power.profile,total]), points = useMemo(()=>graph(power.sbdHistory),[power.sbdHistory]);
  function saveProfile() { const bodyweight = Number(weight.replace(",",".")); if (!bodyweight || bodyweight < 20 || bodyweight > 300) return; save({...ref.current,profile:{bodyweight,sex}}); }
  async function saveCompetitionPr(kg: number) {
    const mainKey = key32(localStorage.getItem(MAIN_SYNC_KEY) ?? ""); let base = readMain();
    try { if (mainKey.length===32) { const response = await fetch("/api/state",{cache:"no-store",headers:{"x-iron-sync-key":mainKey}}); if (response.ok) { const data = await response.json() as {state:MainState|null}; if (data.state) base=data.state; } } } catch {}
    if (base.records[lift]?.weight >= kg) return false;
    const nextRecords = {...base.records,[lift]:{weight:kg,reps:1,date:new Date().toISOString()}}; localStorage.setItem(RECORD_STORAGE,JSON.stringify(nextRecords)); setRecords(nextRecords);
    if (mainKey.length===32) { try { const response=await fetch("/api/state",{method:"PUT",headers:{"content-type":"application/json","x-iron-sync-key":mainKey},body:JSON.stringify({plan:base.plan,records:nextRecords,history:base.history})}); if(response.ok) window.dispatchEvent(new Event("focus")); } catch {} }
    const next = enrich(ref.current,nextRecords); if(next!==ref.current) save(next); return true;
  }
  async function mark(index:number,result:"good"|"miss") { const kg=Number(attempts[index].weight.replace(",",".")); if(!kg) return; setAttempts(rows=>rows.map((row,i)=>i===index?{...row,status:result}:row)); if(result==="miss"){setMessage(`Tentativa ${index+1}: ${kg} kg falhou.`);return;} const wasPr=await saveCompetitionPr(kg); setMessage(wasPr?`PR! ${kg} kg salvo em ${lift}.`:`${kg} kg válido. Não superou o PR atual.`); }
  function changeLift(value:string){setLift(value);setAttempts(Array.from({length:3},()=>({weight:"",status:"pending"})));setMessage("");}

  return <>
    <button className="power-fab" onClick={()=>setOpen(true)} aria-label="Abrir central de powerlifting"><b>POWER+</b><span>{total} KG</span></button>
    {open && <div className="power-suite-backdrop"><section className="power-suite" role="dialog" aria-modal="true" aria-label="Central de powerlifting">
      <header className="power-suite-header"><button onClick={()=>setOpen(false)}>Fechar</button><div><small>IRON LOG</small><strong>POWER CENTER</strong></div><span className={`power-sync ${status}`}>{status==="synced"?"SYNC":status==="syncing"?"...":status==="offline"?"OFF":"LOCAL"}</span></header>
      <nav className="power-tabs"><button className={tab==="dashboard"?"active":""} onClick={()=>setTab("dashboard")}>PAINEL</button><button className={tab==="history"?"active":""} onClick={()=>setTab("history")}>HISTÓRICO PR</button><button className={tab==="competition"?"active":""} onClick={()=>setTab("competition")}>COMPETIÇÃO</button></nav>
      {tab==="dashboard" && <div className="power-content">
        <section className="power-total"><span>TOTAL SBD ATUAL</span><strong>{total}<small>KG</small></strong><i>{MAIN_LIFTS.filter(x=>records[x.key]).length}/3 levantamentos</i></section>
        <section className="power-score-panel"><div className="feature-heading"><div><span>FORÇA RELATIVA</span><strong>DOTS + WILKS</strong></div></div><div className="profile-fields"><label>PESO CORPORAL (KG)<input inputMode="decimal" placeholder="Ex.: 82.5" value={weight} onChange={e=>setWeight(e.target.value)}/></label><label>SEXO DA CATEGORIA<select value={sex} onChange={e=>setSex(e.target.value as Sex)}><option value="male">Masculino</option><option value="female">Feminino</option></select></label></div><button className="profile-save" onClick={saveProfile}>SALVAR PERFIL</button>{power.profile.bodyweight>0?<><div className="score-grid"><article><small>DOTS</small><strong>{dotsValue.toFixed(2)}</strong></article><article><small>WILKS</small><strong>{wilksValue.toFixed(2)}</strong></article></div><div className="athlete-meta"><span>{power.profile.sex==="male"?"MASCULINO":"FEMININO"}</span><b>{power.profile.bodyweight} KG</b></div></>:<p className="feature-empty">Informe seu peso corporal para calcular seus pontos.</p>}</section>
        <section className="chart-card"><div className="feature-heading"><div><span>EVOLUÇÃO</span><strong>GRÁFICO SBD</strong></div><small>{power.sbdHistory.length} MARCOS</small></div>{points.length?<div className="sbd-chart-wrap"><svg className="sbd-chart" viewBox="0 0 320 140" role="img" aria-label="Evolução do total SBD"><line className="chart-axis" x1="16" y1="120" x2="304" y2="120"/><line className="chart-axis" x1="16" y1="25" x2="16" y2="120"/><polyline className="chart-line" points={points.map(p=>`${p.x},${p.y}`).join(" ")}/>{points.map((p,i)=><circle className="chart-dot" key={`${p.x}-${p.total}-${i}`} cx={p.x} cy={p.y} r="4"/>)}</svg><div className="chart-caption"><span>{dateLabel(power.sbdHistory.slice(-points.length)[0].date)}</span><strong>{points.at(-1)?.total} KG</strong><span>{dateLabel(power.sbdHistory.at(-1)?.date??"")}</span></div></div>:<div className="sbd-chart-empty">Registre seus PRs para iniciar o gráfico.</div>}</section>
      </div>}
      {tab==="history" && <div className="power-content"><p className="power-intro">Cada alteração de PR é guardada como um marco. Reiniciar o PR atual não apaga esta linha do tempo.</p><div className="power-history-list">{MAIN_LIFTS.map(item=>{const current=records[item.key],rows=[...(power.prHistory[item.key]??[])].reverse();return <article key={item.key} className="power-history-card"><header><b>{item.code}</b><div><small>COMPETITION LIFT</small><strong>{item.label}</strong></div><aside>{current?`${current.weight} KG`:"SEM PR"}</aside></header>{rows.length?<div>{rows.slice(0,12).map((row,i)=><div className="pr-history-row" key={`${row.date}-${row.weight}-${i}`}><time>{dateLabel(row.date)}</time><strong>{row.weight} KG</strong><span>{row.reps} REP{row.reps!==1?"S":""}</span></div>)}</div>:<p>Nenhum marco registrado ainda.</p>}</article>})}</div></div>}
      {tab==="competition" && <div className="power-content"><p className="power-intro">Simule as três chamadas. Uma tentativa válida acima do PR atual é salva automaticamente.</p><label className="competition-lift-select">LEVANTAMENTO<select value={lift} onChange={e=>changeLift(e.target.value)}>{MAIN_LIFTS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label><div className="competition-current"><span>PR ATUAL</span><strong>{records[lift]?`${records[lift].weight} KG`:"SEM PR"}</strong></div><div className="attempt-list">{attempts.map((attempt,i)=><div className={`attempt-row ${attempt.status}`} key={i}><span>{i+1}</span><label><input inputMode="decimal" placeholder="0" value={attempt.weight} onChange={e=>setAttempts(rows=>rows.map((row,j)=>j===i?{...row,weight:e.target.value,status:"pending"}:row))} disabled={attempt.status!=="pending"}/><small>KG</small></label><button className="good-attempt" onClick={()=>void mark(i,"good")} disabled={attempt.status!=="pending"}>✓</button><button className="miss-attempt" onClick={()=>void mark(i,"miss")} disabled={attempt.status!=="pending"}>×</button></div>)}</div>{message&&<div className="competition-message">{message}</div>}<button className="competition-reset" onClick={()=>{setAttempts(Array.from({length:3},()=>({weight:"",status:"pending"})));setMessage("");}}>NOVA SÉRIE DE TENTATIVAS</button></div>}
    </section></div>}
  </>;
}
