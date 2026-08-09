"use client";

import { useEffect, useMemo, useState } from "react";

type Exercise = { id: string; name: string; sets: number; repMin: number; repMax: number };
type WorkoutDay = { id: string; short: string; day: string; focus: string; accent: string; exercises: Exercise[] };
type PersonalRecord = { weight: number; reps: number; date: string };
type RecordMap = Record<string, PersonalRecord>;
type SetEntry = { weight: string; reps: string; done: boolean };
type SessionRows = Record<string, SetEntry[]>;
type WorkoutHistory = { id: string; date: string; focus: string; day: string; duration: number; volume: number; completedSets: number; prs: number };
type MainView = "workout" | "prs" | "progress";
type SyncStatus = "syncing" | "synced" | "offline" | "local";

const makeExercises = (day: string, rows: (string | number)[][]): Exercise[] => rows.map((x, i) => ({
  id: `${day}-${i}`,
  name: x[0] as string,
  sets: x[1] as number,
  repMin: x[2] as number,
  repMax: x[3] as number,
}));

const initialPlan: WorkoutDay[] = [
  { id: "seg", short: "S", day: "Segunda", focus: "Peito, ombro e tríceps", accent: "push", exercises: makeExercises("seg", [
    ["Supino reto (barra)", 4, 6, 8], ["Supino inclinado (halteres)", 3, 8, 10], ["Crucifixo / peck deck", 3, 10, 12],
    ["Desenvolvimento militar (barra)", 3, 8, 10], ["Elevação lateral", 3, 12, 15], ["Elevação frontal", 2, 12, 15],
    ["Tríceps corda (polia)", 3, 10, 12], ["Tríceps máquina", 3, 10, 12], ["Tríceps unilateral (polia)", 3, 10, 12],
  ])},
  { id: "ter", short: "T", day: "Terça", focus: "Costas e bíceps", accent: "pull", exercises: makeExercises("ter", [
    ["Puxada frente", 4, 8, 10], ["Remada curvada (barra)", 3, 8, 10], ["Remada cavalinho (barra + triângulo)", 3, 10, 12],
    ["Pulldown unilateral", 3, 10, 12], ["Rosca direta (barra)", 3, 10, 12], ["Rosca alternada (halteres)", 3, 10, 12], ["Rosca spider", 3, 10, 12],
  ])},
  { id: "qua", short: "Q", day: "Quarta", focus: "Perna — quadríceps", accent: "legs", exercises: makeExercises("qua", [
    ["Agachamento livre", 4, 6, 8], ["Leg press", 3, 10, 12], ["Cadeira extensora", 3, 12, 15], ["Mesa flexora", 3, 12, 15],
    ["Cadeira adutora / abdutora", 2, 12, 15], ["Panturrilha em pé", 4, 15, 20],
  ])},
  { id: "qui", short: "Q", day: "Quinta", focus: "Peito, ombro e tríceps", accent: "push", exercises: makeExercises("qui", [
    ["Supino inclinado (barra)", 4, 6, 8], ["Supino reto (halteres)", 3, 8, 10], ["Crossover (cabo)", 3, 10, 12],
    ["Desenvolvimento (halteres)", 3, 8, 10], ["Elevação lateral (cabo)", 3, 12, 15], ["Tríceps francês (polia)", 3, 10, 12],
    ["Tríceps máquina", 3, 10, 12], ["Tríceps unilateral (polia)", 3, 10, 12],
  ])},
  { id: "sex", short: "S", day: "Sexta", focus: "Perna — posterior", accent: "legs", exercises: makeExercises("sex", [
    ["Levantamento terra romeno", 4, 8, 10], ["Agachamento búlgaro", 3, 10, 12], ["Mesa flexora", 3, 10, 12],
    ["Cadeira extensora", 3, 12, 15], ["Cadeira adutora / abdutora", 2, 12, 15], ["Panturrilha sentado", 4, 15, 20],
  ])},
  { id: "sab", short: "S", day: "Sábado", focus: "Costas e bíceps", accent: "pull", exercises: makeExercises("sab", [
    ["Levantamento terra convencional", 4, 5, 6], ["Remada baixa (cabo)", 3, 8, 10], ["Remada cavalinho (barra + triângulo)", 3, 10, 12],
    ["Puxada supinada", 3, 10, 12], ["Rosca alternada (halteres)", 3, 10, 12], ["Rosca martelo", 3, 10, 12], ["Rosca concentrada", 3, 12, 15],
  ])},
];

const MAIN_LIFTS = [
  { key: "Agachamento livre", label: "Agachamento", code: "S", order: "01" },
  { key: "Supino reto (barra)", label: "Supino", code: "B", order: "02" },
  { key: "Levantamento terra convencional", label: "Terra", code: "D", order: "03" },
] as const;

function isMainLift(exerciseName: string) {
  return MAIN_LIFTS.some((lift) => lift.key === exerciseName);
}

const storage = {
  plan: "meu-treino-plan",
  records: "meu-treino-records",
  history: "meu-treino-history",
};

function todayId() {
  return ["seg", "seg", "ter", "qua", "qui", "sex", "sab"][new Date().getDay()];
}

function formatTimer(seconds: number) {
  const min = Math.floor(seconds / 60).toString().padStart(2, "0");
  const sec = (seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function isNewRecord(next: PersonalRecord, current?: PersonalRecord) {
  return !current || next.weight > current.weight || (next.weight === current.weight && next.reps > current.reps);
}

export default function Home() {
  const [plan, setPlan] = useState<WorkoutDay[]>(initialPlan);
  const [selectedId, setSelectedId] = useState("seg");
  const [records, setRecords] = useState<RecordMap>({});
  const [history, setHistory] = useState<WorkoutHistory[]>([]);
  const [view, setView] = useState<MainView>("workout");
  const [ready, setReady] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<WorkoutDay | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionRows, setSessionRows] = useState<SessionRows>({});
  const [sessionStartedAt, setSessionStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [restLeft, setRestLeft] = useState(0);
  const [sessionPRs, setSessionPRs] = useState(0);
  const [prExercise, setPrExercise] = useState<string | null>(null);
  const [prWeight, setPrWeight] = useState("");
  const [prReps, setPrReps] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("syncing");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    let cachedPlan = initialPlan;
    let cachedRecords: RecordMap = {};
    let cachedHistory: WorkoutHistory[] = [];
    try {
      const savedPlan = window.localStorage.getItem(storage.plan);
      const savedRecords = window.localStorage.getItem(storage.records);
      const savedHistory = window.localStorage.getItem(storage.history);
      if (savedPlan) cachedPlan = JSON.parse(savedPlan);
      if (savedRecords) cachedRecords = JSON.parse(savedRecords);
      if (savedHistory) cachedHistory = JSON.parse(savedHistory);
    } catch { /* mantém os dados originais */ }
    setPlan(cachedPlan);
    setRecords(cachedRecords);
    setHistory(cachedHistory);
    setSelectedId(todayId());
    setReady(true);
    void pullFromCloud({ plan: cachedPlan, records: cachedRecords, history: cachedHistory });

    const refreshOnFocus = () => void pullFromCloud();
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, []);

  useEffect(() => {
    if (!sessionOpen) return;
    const ticker = window.setInterval(() => setElapsed(Math.floor((Date.now() - sessionStartedAt) / 1000)), 1000);
    return () => window.clearInterval(ticker);
  }, [sessionOpen, sessionStartedAt]);

  useEffect(() => {
    if (restLeft <= 0) return;
    const ticker = window.setInterval(() => setRestLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(ticker);
  }, [restLeft]);

  const selected = useMemo(() => plan.find((day) => day.id === selectedId) ?? plan[0], [plan, selectedId]);
  const totalSets = selected.exercises.reduce((total, exercise) => total + exercise.sets, 0);
  const recordCount = MAIN_LIFTS.filter((lift) => records[lift.key]).length;
  const totalSBD = MAIN_LIFTS.reduce((total, lift) => total + (records[lift.key]?.weight ?? 0), 0);
  const totalVolume = history.reduce((sum, workout) => sum + workout.volume, 0);

  async function syncToCloud(nextPlan: WorkoutDay[], nextRecords: RecordMap, nextHistory: WorkoutHistory[]) {
    setSyncStatus("syncing");
    try {
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: nextPlan, records: nextRecords, history: nextHistory }),
      });
      if (response.status === 401) { setSyncStatus("local"); return; }
      if (!response.ok) throw new Error("sync_failed");
      setSyncStatus("synced");
    } catch {
      setSyncStatus("offline");
    }
  }

  async function pullFromCloud(fallback?: { plan: WorkoutDay[]; records: RecordMap; history: WorkoutHistory[] }) {
    setSyncStatus("syncing");
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (response.status === 401) { setSyncStatus("local"); return; }
      if (!response.ok) throw new Error("sync_failed");
      const data = await response.json() as { state: { plan: WorkoutDay[]; records: RecordMap; history: WorkoutHistory[] } | null; user?: { displayName?: string } };
      setUserName(data.user?.displayName ?? "");
      if (data.state) {
        const nextPlan = data.state.plan.length ? data.state.plan : initialPlan;
        const nextRecords: RecordMap = { ...(data.state.records ?? {}) };
        if (fallback) {
          Object.entries(fallback.records).forEach(([name, candidate]) => {
            if (isMainLift(name) && isNewRecord(candidate, nextRecords[name])) nextRecords[name] = candidate;
          });
        }
        const remoteHistory = data.state.history ?? [];
        const knownHistoryIds = new Set(remoteHistory.map((workout) => workout.id));
        const nextHistory = fallback ? [...remoteHistory, ...fallback.history.filter((workout) => !knownHistoryIds.has(workout.id))] : remoteHistory;
        setPlan(nextPlan); setRecords(nextRecords); setHistory(nextHistory);
        window.localStorage.setItem(storage.plan, JSON.stringify(nextPlan));
        window.localStorage.setItem(storage.records, JSON.stringify(nextRecords));
        window.localStorage.setItem(storage.history, JSON.stringify(nextHistory));
        if (fallback) await syncToCloud(nextPlan, nextRecords, nextHistory);
        else setSyncStatus("synced");
      } else {
        const next = fallback ?? { plan, records, history };
        await syncToCloud(next.plan, next.records, next.history);
      }
    } catch {
      setSyncStatus("offline");
    }
  }

  function persistPlan(next: WorkoutDay[]) {
    setPlan(next);
    window.localStorage.setItem(storage.plan, JSON.stringify(next));
    void syncToCloud(next, records, history);
  }

  function openEditor() {
    setEditDraft(JSON.parse(JSON.stringify(selected)));
    setEditorOpen(true);
  }

  function saveEditor() {
    if (!editDraft) return;
    const cleaned = { ...editDraft, focus: editDraft.focus.trim() || selected.focus, exercises: editDraft.exercises.filter((exercise) => exercise.name.trim()) };
    persistPlan(plan.map((day) => day.id === cleaned.id ? cleaned : day));
    setEditorOpen(false);
  }

  function updateDraftExercise(id: string, field: keyof Exercise, value: string) {
    if (!editDraft) return;
    setEditDraft({ ...editDraft, exercises: editDraft.exercises.map((exercise) => exercise.id === id ? {
      ...exercise,
      [field]: field === "name" ? value : Math.max(1, Number(value) || 1),
    } : exercise) });
  }

  function moveDraftExercise(index: number, direction: -1 | 1) {
    if (!editDraft) return;
    const target = index + direction;
    if (target < 0 || target >= editDraft.exercises.length) return;
    const exercises = [...editDraft.exercises];
    [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
    setEditDraft({ ...editDraft, exercises });
  }

  function startSession() {
    const rows: SessionRows = {};
    selected.exercises.forEach((exercise) => {
      rows[exercise.id] = Array.from({ length: exercise.sets }, () => ({ weight: "", reps: "", done: false }));
    });
    setSessionRows(rows);
    setSessionStartedAt(Date.now());
    setElapsed(0);
    setSessionPRs(0);
    setRestLeft(0);
    setSessionOpen(true);
  }

  function updateSet(exerciseId: string, index: number, field: "weight" | "reps", value: string) {
    setSessionRows((current) => ({ ...current, [exerciseId]: current[exerciseId].map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row) }));
  }

  function toggleSet(exercise: Exercise, index: number) {
    const row = sessionRows[exercise.id][index];
    if (!row.done && (!Number(row.weight) || !Number(row.reps))) return;
    const nextDone = !row.done;
    setSessionRows((current) => ({ ...current, [exercise.id]: current[exercise.id].map((item, rowIndex) => rowIndex === index ? { ...item, done: nextDone } : item) }));
    if (nextDone) {
      const candidate = { weight: Number(row.weight), reps: Number(row.reps), date: new Date().toISOString() };
      if (isMainLift(exercise.name) && isNewRecord(candidate, records[exercise.name])) {
        const nextRecords = { ...records, [exercise.name]: candidate };
        setRecords(nextRecords);
        window.localStorage.setItem(storage.records, JSON.stringify(nextRecords));
        void syncToCloud(plan, nextRecords, history);
        setSessionPRs((value) => value + 1);
      }
      setRestLeft(90);
    }
  }

  function finishSession() {
    let volume = 0;
    let completedSets = 0;
    Object.values(sessionRows).flat().forEach((row) => {
      if (row.done) { volume += Number(row.weight) * Number(row.reps); completedSets += 1; }
    });
    const workout: WorkoutHistory = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, date: new Date().toISOString(), focus: selected.focus, day: selected.day,
      duration: Math.max(1, Math.round(elapsed / 60)), volume: Math.round(volume), completedSets, prs: sessionPRs,
    };
    const nextHistory = [workout, ...history];
    setHistory(nextHistory);
    window.localStorage.setItem(storage.history, JSON.stringify(nextHistory));
    void syncToCloud(plan, records, nextHistory);
    setSessionOpen(false);
    setRestLeft(0);
    setView("progress");
  }

  function openPR(exerciseName: string) {
    const current = records[exerciseName];
    setPrExercise(exerciseName);
    setPrWeight(current ? String(current.weight) : "");
    setPrReps(current ? String(current.reps) : "");
  }

  function savePR() {
    if (!prExercise || !Number(prWeight) || !Number(prReps)) return;
    const nextRecords = { ...records, [prExercise]: { weight: Number(prWeight), reps: Number(prReps), date: new Date().toISOString() } };
    setRecords(nextRecords);
    window.localStorage.setItem(storage.records, JSON.stringify(nextRecords));
    void syncToCloud(plan, nextRecords, history);
    setPrExercise(null);
  }

  if (!ready) return <main className="app-shell loading-shell" aria-label="Carregando treino" />;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><b>SBD</b></div>
        <div className="brand-copy"><span>IRON LOG</span><small>POWERLIFTING TRAINING</small></div>
        <div className="top-stats"><strong>{totalSBD}</strong><span>TOTAL KG</span></div>
      </header>
      <button className={`sync-banner ${syncStatus}`} onClick={() => void pullFromCloud()} aria-label="Sincronizar dados agora">
        <i /><strong>{syncStatus === "synced" ? "DADOS SINCRONIZADOS" : syncStatus === "syncing" ? "SINCRONIZANDO" : syncStatus === "offline" ? "SEM CONEXÃO" : "MODO LOCAL"}</strong>
        <span>{syncStatus === "synced" ? (userName || "online no celular e no PC") : syncStatus === "offline" ? "toque para tentar novamente" : syncStatus === "local" ? "entre pelo link publicado para sincronizar" : "aguarde"}</span>
      </button>

      {view === "workout" && <>
        <section className="hero">
          <p className="eyebrow">POWERLIFTING • SQUAT / BENCH / DEADLIFT</p>
          <div className="hero-title-row">
            <h1>Os três<br/><em>grandes.</em></h1>
            <div className="week-ring total-plate" aria-label={`Total SBD de ${totalSBD} quilos`}><strong>{totalSBD}</strong><span>KG</span></div>
          </div>
          <div className="big-three-strip">
            {MAIN_LIFTS.map((lift) => <button key={lift.key} onClick={() => setView("prs")}><span>{lift.code}</span><div><small>{lift.label}</small><strong>{records[lift.key] ? `${records[lift.key].weight} KG` : "SEM PR"}</strong></div></button>)}
          </div>
        </section>

        <nav className="day-strip" aria-label="Dias de treino">
          {plan.map((day) => <button key={day.id} className={day.id === selected.id ? "day-pill active" : "day-pill"} onClick={() => setSelectedId(day.id)} aria-current={day.id === selected.id ? "date" : undefined}>
            <span>{day.short}</span><small>{day.day.slice(0, 3)}</small>
          </button>)}
        </nav>

        <section className={`workout-panel ${selected.accent}`}>
          <div className="workout-heading">
            <div><p className="eyebrow">{selected.day.toUpperCase()} • TREINO {selected.accent.toUpperCase()}</p><h2>{selected.focus}</h2><p>{selected.exercises.length} exercícios <i>•</i> {totalSets} séries</p></div>
            <button className="edit-button" onClick={openEditor} aria-label="Editar treino">Editar</button>
          </div>
          <div className="exercise-list">
            {selected.exercises.map((exercise, index) => {
              const mainLift = isMainLift(exercise.name);
              const pr = records[exercise.name];
              return <button className={mainLift ? "exercise-card main-lift" : "exercise-card accessory"} key={exercise.id} onClick={() => mainLift && openPR(exercise.name)} aria-label={mainLift ? `Abrir recorde de ${exercise.name}` : exercise.name}>
                <span className="exercise-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="exercise-main"><strong>{exercise.name}</strong><small>{exercise.sets} séries <b>×</b> {exercise.repMin}–{exercise.repMax} reps</small></span>
                {mainLift ? <><span className={pr ? "pr-value has-pr" : "pr-value"}><small>PR</small><strong>{pr ? `${pr.weight}kg` : "—"}</strong>{pr && <i>{pr.reps} reps</i>}</span><span className="chevron" aria-hidden="true">›</span></> : <span className="accessory-label">ACESSÓRIO</span>}
              </button>;
            })}
          </div>
          <button className="start-button" onClick={startSession}><span>▶</span> INICIAR TREINO</button>
        </section>
        <aside className="rule-card"><span>REGRA DE FERRO</span><p>Técnica primeiro nos três grandes. Sem drop set. Cardio com corda: 1 min pulando e 30 s de descanso.</p></aside>
      </>}

      {view === "prs" && <section className="page-view">
        <p className="eyebrow">SBD • SEUS TRÊS LEVANTAMENTOS</p>
        <h1>Total <em>SBD.</em></h1>
        <p className="page-intro">Acompanhe somente os recordes que definem o powerlifting: agachamento, supino e terra.</p>
        <div className="sbd-total"><span>TOTAL ATUAL</span><strong>{totalSBD}<small>KG</small></strong><i>{recordCount}/3 levantamentos registrados</i></div>
        <div className="big-lifts-list">
          {MAIN_LIFTS.map((lift) => {
            const pr = records[lift.key];
            return <button key={lift.key} onClick={() => openPR(lift.key)} className={pr ? "big-lift-card recorded" : "big-lift-card"}>
              <span>{lift.order}</span><b>{lift.code}</b><div><small>COMPETITION LIFT</small><strong>{lift.label}</strong><i>{lift.key}</i></div>
              <aside>{pr ? <><strong>{pr.weight}<small>KG</small></strong><span>{pr.reps} REP{pr.reps !== 1 ? "S" : ""}</span></> : <><strong>—</strong><span>ADICIONAR PR</span></>}</aside>
            </button>;
          })}
        </div>
        <p className="sbd-note">TOTAL SBD = AGACHAMENTO + SUPINO + TERRA</p>
      </section>}

      {view === "progress" && <section className="page-view">
        <p className="eyebrow">HISTÓRICO</p>
        <h1>Sua <em>evolução.</em></h1>
        <p className="page-intro">Cada treino finalizado aparece aqui, salvo neste dispositivo.</p>
        <div className="progress-grid">
          <article><span>TREINOS</span><strong>{history.length}</strong><small>concluídos</small></article>
          <article><span>VOLUME</span><strong>{totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}t` : `${totalVolume}kg`}</strong><small>acumulado</small></article>
          <article><span>TOTAL SBD</span><strong>{totalSBD}kg</strong><small>três grandes</small></article>
        </div>
        <h2 className="section-label">TREINOS RECENTES</h2>
        {history.length === 0 ? <div className="empty-state"><span>↗</span><h3>Seu histórico começa agora</h3><p>Finalize seu primeiro treino para acompanhar duração, volume e PRs.</p><button onClick={() => setView("workout")}>IR PARA O TREINO</button></div> :
          <div className="history-list">{history.map((workout) => <article key={workout.id}>
            <time>{new Date(workout.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</time>
            <div><strong>{workout.day} • {workout.focus}</strong><span>{workout.completedSets} séries • {workout.duration} min</span></div>
            <aside><b>{workout.volume}kg</b>{workout.prs > 0 && <small>+{workout.prs} PR</small>}</aside>
          </article>)}</div>}
      </section>}

      <footer className="bottom-bar" aria-label="Navegação principal">
        <button className={view === "workout" ? "active" : ""} onClick={() => setView("workout")}><span>▰</span>Treino</button>
        <button className={view === "prs" ? "active" : ""} onClick={() => setView("prs")}><span>SBD</span>PRs</button>
        <button className={view === "progress" ? "active" : ""} onClick={() => setView("progress")}><span>↗</span>Progresso</button>
      </footer>

      {editorOpen && editDraft && <div className="full-modal editor-modal" role="dialog" aria-modal="true" aria-label="Editar treino">
        <header><button onClick={() => setEditorOpen(false)}>Cancelar</button><div><small>EDITANDO</small><strong>{editDraft.day}</strong></div><button className="save-link" onClick={saveEditor}>Salvar</button></header>
        <section className="modal-content">
          <label className="field-label">NOME DO TREINO<input value={editDraft.focus} onChange={(event) => setEditDraft({ ...editDraft, focus: event.target.value })} /></label>
          <div className="editor-label"><span>EXERCÍCIOS</span><small>{editDraft.exercises.length} itens</small></div>
          {editDraft.exercises.map((exercise, index) => <article className="edit-exercise" key={exercise.id}>
            <div className="edit-order"><button onClick={() => moveDraftExercise(index, -1)} disabled={index === 0}>↑</button><button onClick={() => moveDraftExercise(index, 1)} disabled={index === editDraft.exercises.length - 1}>↓</button></div>
            <div className="edit-fields"><input aria-label="Nome do exercício" value={exercise.name} onChange={(event) => updateDraftExercise(exercise.id, "name", event.target.value)} /><div>
              <label>Séries<input type="number" min="1" value={exercise.sets} onChange={(event) => updateDraftExercise(exercise.id, "sets", event.target.value)} /></label>
              <label>Rep. mín.<input type="number" min="1" value={exercise.repMin} onChange={(event) => updateDraftExercise(exercise.id, "repMin", event.target.value)} /></label>
              <label>Rep. máx.<input type="number" min="1" value={exercise.repMax} onChange={(event) => updateDraftExercise(exercise.id, "repMax", event.target.value)} /></label>
            </div></div>
            <button className="delete-exercise" aria-label={`Excluir ${exercise.name}`} onClick={() => setEditDraft({ ...editDraft, exercises: editDraft.exercises.filter((item) => item.id !== exercise.id) })}>×</button>
          </article>)}
          <button className="add-exercise" onClick={() => setEditDraft({ ...editDraft, exercises: [...editDraft.exercises, { id: `${editDraft.id}-${Date.now()}`, name: "Novo exercício", sets: 3, repMin: 8, repMax: 12 }] })}>＋ ADICIONAR EXERCÍCIO</button>
          <button className="restore-button" onClick={() => { const original = initialPlan.find((day) => day.id === editDraft.id); if (original) setEditDraft(JSON.parse(JSON.stringify(original))); }}>Restaurar treino original</button>
        </section>
      </div>}

      {sessionOpen && <div className="full-modal session-modal" role="dialog" aria-modal="true" aria-label="Treino em andamento">
        <header><button onClick={() => setSessionOpen(false)}>Fechar</button><div><small>TREINO EM ANDAMENTO</small><strong>{formatTimer(elapsed)}</strong></div><button className="finish-link" onClick={finishSession}>Finalizar</button></header>
        <section className="session-hero"><p>{selected.day.toUpperCase()}</p><h2>{selected.focus}</h2><div><span>{Object.values(sessionRows).flat().filter((row) => row.done).length}/{totalSets} séries</span><i>{sessionPRs} PRs</i></div></section>
        <section className="session-content">
          {selected.exercises.map((exercise, exerciseIndex) => <article className="session-exercise" key={exercise.id}>
            <div className="session-exercise-head"><span>{String(exerciseIndex + 1).padStart(2, "0")}</span><div><h3>{exercise.name}</h3><p>Meta: {exercise.repMin}–{exercise.repMax} reps</p></div>{isMainLift(exercise.name) && records[exercise.name] && <b>PR {records[exercise.name].weight}kg</b>}</div>
            <div className="set-head"><span>SÉRIE</span><span>KG</span><span>REPS</span><span>OK</span></div>
            {sessionRows[exercise.id].map((row, index) => <div className={row.done ? "set-row done" : "set-row"} key={index}>
              <strong>{index + 1}</strong>
              <input inputMode="decimal" aria-label={`Peso da série ${index + 1} de ${exercise.name}`} placeholder="0" value={row.weight} onChange={(event) => updateSet(exercise.id, index, "weight", event.target.value)} disabled={row.done} />
              <input inputMode="numeric" aria-label={`Repetições da série ${index + 1} de ${exercise.name}`} placeholder="0" value={row.reps} onChange={(event) => updateSet(exercise.id, index, "reps", event.target.value)} disabled={row.done} />
              <button aria-label={`${row.done ? "Desmarcar" : "Concluir"} série ${index + 1}`} onClick={() => toggleSet(exercise, index)}>{row.done ? "✓" : "○"}</button>
            </div>)}
          </article>)}
          <button className="finish-workout" onClick={finishSession}>FINALIZAR TREINO</button>
        </section>
        {restLeft > 0 && <aside className="rest-timer"><div><small>DESCANSO</small><strong>{formatTimer(restLeft)}</strong></div><button onClick={() => setRestLeft((value) => value + 30)}>+30s</button><button onClick={() => setRestLeft(0)}>Pular</button></aside>}
      </div>}

      {prExercise && <div className="modal-backdrop" onMouseDown={() => setPrExercise(null)}>
        <section className="pr-modal" role="dialog" aria-modal="true" aria-label="Editar recorde pessoal" onMouseDown={(event) => event.stopPropagation()}>
          <span className="modal-kicker">COMPETITION LIFT • RECORDE PESSOAL</span><h2>{prExercise}</h2><p>Registre seu melhor levantamento nos três grandes.</p>
          <div className="pr-inputs"><label>PESO (KG)<input autoFocus inputMode="decimal" value={prWeight} onChange={(event) => setPrWeight(event.target.value)} placeholder="0" /></label><b>×</b><label>REPETIÇÕES<input inputMode="numeric" value={prReps} onChange={(event) => setPrReps(event.target.value)} placeholder="0" /></label></div>
          <button className="start-button" onClick={savePR}>SALVAR PR</button><button className="modal-cancel" onClick={() => setPrExercise(null)}>Cancelar</button>
        </section>
      </div>}
    </main>
  );
}
