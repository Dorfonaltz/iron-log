"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type LoadEntry = {
  weight: number;
  reps: number;
  date: string;
  deleted?: boolean;
};

type LoadMap = Record<string, LoadEntry>;
type PortalTarget = { key: string; name: string; node: HTMLElement };

const STORAGE_KEY = "iron-log-last-loads-v1";
const MAIN_SYNC_KEY = "iron-log-sync-key";

function normalizeKey(value: string) {
  return value.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

function isLoadEntry(value: unknown): value is LoadEntry {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<LoadEntry>;
  return typeof row.weight === "number" && typeof row.reps === "number" && typeof row.date === "string";
}

function parseLoadMap(value: unknown): LoadMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: LoadMap = {};
  Object.entries(value as Record<string, unknown>).forEach(([name, row]) => {
    if (isLoadEntry(row)) result[name] = row;
  });
  return result;
}

function loadLocal(): LoadMap {
  try {
    return parseLoadMap(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

function mergeLoads(local: LoadMap, remote: LoadMap): LoadMap {
  const merged: LoadMap = { ...local };
  Object.entries(remote).forEach(([name, remoteRow]) => {
    const localRow = merged[name];
    if (!localRow || remoteRow.date > localRow.date) merged[name] = remoteRow;
  });
  return merged;
}

async function deriveSyncKey(mainKey: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`IRON-LOG-LOADS:${mainKey}`)),
  );
  return Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function LoadEditor({
  name,
  value,
  onSave,
  onClear,
}: {
  name: string;
  value?: LoadEntry;
  onSave: (name: string, weight: number, reps: number) => void;
  onClear: (name: string) => void;
}) {
  const activeValue = value && !value.deleted ? value : undefined;
  const [weight, setWeight] = useState(activeValue ? String(activeValue.weight) : "");
  const [reps, setReps] = useState(activeValue ? String(activeValue.reps) : "");

  useEffect(() => {
    setWeight(activeValue ? String(activeValue.weight) : "");
    setReps(activeValue ? String(activeValue.reps) : "");
  }, [activeValue?.weight, activeValue?.reps, activeValue?.date]);

  function save() {
    const parsedWeight = Number(weight.replace(",", "."));
    const parsedReps = Number(reps);
    if (!parsedWeight || parsedWeight <= 0 || !parsedReps || parsedReps <= 0) return;
    onSave(name, parsedWeight, Math.round(parsedReps));
  }

  return (
    <div className="last-load-row">
      <div className="last-load-copy">
        <span>ÚLTIMA CARGA</span>
        <small>{activeValue ? `${activeValue.weight} kg × ${activeValue.reps} reps • ${formatDate(activeValue.date)}` : "Ainda não registrada"}</small>
      </div>
      <label>
        <span>KG</span>
        <input inputMode="decimal" aria-label={`Última carga de ${name}`} placeholder="0" value={weight} onChange={(event) => setWeight(event.target.value)} />
      </label>
      <label>
        <span>REPS</span>
        <input inputMode="numeric" aria-label={`Últimas repetições de ${name}`} placeholder="0" value={reps} onChange={(event) => setReps(event.target.value)} />
      </label>
      <button className="last-load-save" onClick={save}>SALVAR</button>
      {activeValue && <button className="last-load-clear" aria-label={`Apagar última carga de ${name}`} onClick={() => onClear(name)}>×</button>}
    </div>
  );
}

export default function ExerciseLoads() {
  const [loads, setLoads] = useState<LoadMap>({});
  const [targets, setTargets] = useState<PortalTarget[]>([]);
  const [syncStatus, setSyncStatus] = useState<"local" | "syncing" | "synced" | "offline">("local");
  const loadsRef = useRef<LoadMap>({});
  const syncingRef = useRef(false);

  function apply(next: LoadMap) {
    loadsRef.current = next;
    setLoads(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function sync(next: LoadMap) {
    if (syncingRef.current) return;
    const mainKey = normalizeKey(window.localStorage.getItem(MAIN_SYNC_KEY) ?? "");
    if (mainKey.length !== 32) {
      setSyncStatus("local");
      return;
    }

    syncingRef.current = true;
    setSyncStatus("syncing");
    try {
      const key = await deriveSyncKey(mainKey);
      const response = await fetch("/api/state", {
        cache: "no-store",
        headers: { "x-iron-sync-key": key },
      });

      let merged = next;
      if (response.ok) {
        const data = await response.json() as { state: { records?: Record<string, unknown> } | null };
        const remote = parseLoadMap(data.state?.records?.exerciseLoads);
        merged = mergeLoads(next, remote);
      }

      const write = await fetch("/api/state", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-iron-sync-key": key },
        body: JSON.stringify({ plan: [], records: { exerciseLoads: merged }, history: [] }),
      });
      if (!write.ok) throw new Error("load_sync_failed");

      if (JSON.stringify(merged) !== JSON.stringify(loadsRef.current)) apply(merged);
      setSyncStatus("synced");
    } catch {
      setSyncStatus("offline");
    } finally {
      syncingRef.current = false;
    }
  }

  useEffect(() => {
    const initial = loadLocal();
    apply(initial);
    const starter = window.setTimeout(() => void sync(initial), 450);
    const refresh = () => void sync(loadsRef.current);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearTimeout(starter);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    let scheduled = 0;

    const scan = () => {
      scheduled = 0;
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".exercise-list .exercise-card"));
      const nextTargets: PortalTarget[] = [];

      cards.forEach((card, index) => {
        const name = card.querySelector<HTMLElement>(".exercise-main strong")?.textContent?.trim();
        if (!name) return;

        let slot = card.nextElementSibling instanceof HTMLElement && card.nextElementSibling.dataset.ironLoadSlot === "1"
          ? card.nextElementSibling
          : null;

        if (!slot) {
          slot = document.createElement("div");
          slot.dataset.ironLoadSlot = "1";
          slot.className = "exercise-load-slot";
          card.insertAdjacentElement("afterend", slot);
        }
        slot.dataset.exerciseName = name;
        nextTargets.push({ key: `${name}-${index}`, name, node: slot });
      });

      document.querySelectorAll<HTMLElement>("[data-iron-load-slot='1']").forEach((slot) => {
        if (!nextTargets.some((target) => target.node === slot)) slot.remove();
      });

      setTargets(nextTargets);
    };

    const queueScan = () => {
      if (scheduled) return;
      scheduled = window.requestAnimationFrame(scan);
    };

    queueScan();
    const observer = new MutationObserver(queueScan);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (scheduled) window.cancelAnimationFrame(scheduled);
      document.querySelectorAll<HTMLElement>("[data-iron-load-slot='1']").forEach((slot) => slot.remove());
    };
  }, []);

  function saveLoad(name: string, weight: number, reps: number) {
    const next = { ...loadsRef.current, [name]: { weight, reps, date: new Date().toISOString() } };
    apply(next);
    void sync(next);
  }

  function clearLoad(name: string) {
    if (!window.confirm(`Apagar a última carga registrada de ${name}?`)) return;
    const next = { ...loadsRef.current, [name]: { weight: 0, reps: 0, date: new Date().toISOString(), deleted: true } };
    apply(next);
    void sync(next);
  }

  return (
    <>
      <div className={`load-sync-indicator ${syncStatus}`} aria-hidden="true">
        {syncStatus === "synced" ? "CARGAS SYNC" : syncStatus === "syncing" ? "CARGAS..." : syncStatus === "offline" ? "CARGAS OFF" : "CARGAS LOCAL"}
      </div>
      {targets.map((target) => createPortal(
        <LoadEditor key={target.key} name={target.name} value={loads[target.name]} onSave={saveLoad} onClear={clearLoad} />,
        target.node,
        target.key,
      ))}
    </>
  );
}
