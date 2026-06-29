// =====================================================================
//  Carga · app de seguimiento de hipertrofia (JS puro, sin compilación)
//  Firebase: Auth con Google + Firestore. Datos de la rutina: routine.js
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDocs, query, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import { DAYS, PRINCIPLES, EXERCISE_INDEX, videoUrl, DUMBBELL_CAP_KG, exerciseImages, exerciseSource, VOLUME_TARGET } from "./routine.js";

const root = document.getElementById("app");
const CONFIGURED = !String(firebaseConfig.apiKey || "").startsWith("PEGA_TU");

// ---------- estado ----------
const state = {
  user: null,
  sessions: [],      // [{id, dayId, dayName, date, entries:{exId:{peso,reps,notas}}, durationSec}]
  loaded: false,
  variants: {},      // { exId: true }  ejercicios sustituidos por su variante
  favorites: {},     // { exId: true }  ejercicios marcados como favoritos
  photos: [],        // fotos de progreso
  progLoaded: false,
  measures: [],      // [{id, date, values:{peso,cintura,...}}]
  measLoaded: false,
  measMetric: "peso",
  volWeek: null,     // semana visible en "Volumen"
  recapWeek: null,   // semana visible en "Resumen"
};

// métricas de medidas corporales
const MEASURE_FIELDS = [
  { key: "peso", label: "Peso", unit: "kg", step: "0.1" },
  { key: "cintura", label: "Cintura", unit: "cm", step: "0.5" },
  { key: "pecho", label: "Pecho", unit: "cm", step: "0.5" },
  { key: "brazo", label: "Brazo", unit: "cm", step: "0.5" },
  { key: "muslo", label: "Muslo", unit: "cm", step: "0.5" },
  { key: "cadera", label: "Cadera", unit: "cm", step: "0.5" },
];

function loadVariants() {
  try { return JSON.parse(localStorage.getItem("carga_variants") || "{}") || {}; }
  catch (_) { return {}; }
}
function saveVariants() {
  try { localStorage.setItem("carga_variants", JSON.stringify(state.variants)); } catch (_) {}
}
// Devuelve el ejercicio activo: la variante si está sustituido, si no el original.
function resolveExercise(base) {
  if (state.variants[base.id] && base.variant) {
    return { ...base, ...base.variant, id: base.id, isVariant: true, base };
  }
  return { ...base, isVariant: false, base };
}

let auth = null, db = null;
state.variants = loadVariants();
state.favorites = loadFavorites();

// ---------- utilidades ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const todayISO = () => {
  const d = new Date(); const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
const MES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const MES_LARGO = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const fmtDate = (iso) => { const [y,m,dd] = iso.split("-"); return `${+dd} ${MES[+m-1]}`; };
const fmtDateLong = (iso) => { const [y,m,dd] = iso.split("-"); return `${+dd} ${MES[+m-1]} ${y}`; };
const monthLabel = (y, m) => `${MES_LARGO[m-1]} ${y}`;
const isoOf = (d) => { const z = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; };
const addDaysISO = (iso, n) => { const [y, m, dd] = iso.split("-").map(Number); const d = new Date(y, m - 1, dd); d.setDate(d.getDate() + n); return isoOf(d); };
// semana lunes→domingo que contiene refISO
function weekRange(refISO) {
  const [y, m, dd] = refISO.split("-").map(Number);
  const d = new Date(y, m - 1, dd);
  const wd = (d.getDay() + 6) % 7;            // lunes = 0
  const start = new Date(d); start.setDate(d.getDate() - wd);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return { start: isoOf(start), end: isoOf(end) };
}
const num = (v) => (v === "" || v == null || isNaN(+v)) ? null : +v;
const fmtSets = (n) => Number.isInteger(n) ? String(n) : (Math.round(n * 2) / 2).toFixed(1);
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
function howToHtml(ex) {
  const pasos = (ex.pasos && ex.pasos.length)
    ? `<ol class="pasos">${ex.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>`
    : `<p>${esc(ex.ejecucion || "")}</p>`;
  const resp = ex.respiracion ? `<p class="howline"><b>Respiración:</b> ${esc(ex.respiracion)}</p>` : "";
  const good = ex.repBuena ? `<p class="howline"><b>Buena rep:</b> ${esc(ex.repBuena)}</p>` : "";
  return pasos + resp + good;
}
const fmtDur = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const mm = String(m).padStart(2, "0"), sss = String(ss).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${sss}` : `${mm}:${sss}`;
};

// cronómetro de la sesión (cuenta desde que empiezas hasta que guardas)
let sessClockTimer = null;
function tickSessClock() {
  if (!draft) { stopSessionClock(); return; }
  const el = document.getElementById("sessclockt");
  if (el) el.textContent = fmtDur(Date.now() - draft.startedAt);
}
function startSessionClock() { if (!sessClockTimer) sessClockTimer = setInterval(tickSessClock, 1000); }
function stopSessionClock() { if (sessClockTimer) { clearInterval(sessClockTimer); sessClockTimer = null; } }
function sessClockHtml() {
  const elapsed = draft && draft.startedAt ? Date.now() - draft.startedAt : 0;
  return `<span class="sessclock" id="sessclock">${I.clock}<b id="sessclockt">${fmtDur(elapsed)}</b></span>`;
}

function toast(msg, err = false) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

// ---------- iconos ----------
const I = {
  dumbbell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5 17.5 17.5"/><path d="M3 8v8M5 5v14M19 5v14M21 8v8"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4" fill="currentColor"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/></svg>',
  google: '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.45 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 4.75 12 4.75z"/></svg>',
};

// ---------- helpers de registro ----------
// Una entrada es: { peso: número|null (uno por ejercicio), reps: [r1, r2, ...], notas }
function entryReps(e) { return ((e && Array.isArray(e.reps)) ? e.reps : []).map((r) => num(r)).filter((v) => v != null); }
function workWeight(e) { return num(e && e.peso); }
function entryVolume(e) {
  const w = workWeight(e);
  if (w == null) return 0;
  return w * entryReps(e).reduce((a, b) => a + b, 0);
}
function entryHasData(e) { return workWeight(e) != null || entryReps(e).length > 0 || !!(e && e.notas); }
// Texto compacto, p. ej. "9 kg · 10, 8, 4 reps" o "45, 42, 40 s".
function formatSets(ex, e) {
  const reps = (e && Array.isArray(e.reps)) ? e.reps : [];
  const list = reps.map((r) => (num(r) != null ? r : "–"));
  if (!list.length) return "—";
  if (ex && ex.unit === "seg") return list.join(", ") + " s";
  const w = workWeight(e);
  return (w != null ? `${w} kg · ` : "") + list.join(", ") + " reps";
}

// ---------- progresión (doble progresión) ----------
function lastEntryFor(exId) {
  for (const s of state.sessions) {           // sessions vienen ordenadas desc por fecha
    const e = s.entries && s.entries[exId];
    if (e && (workWeight(e) != null || entryReps(e).length > 0)) return { entry: e, date: s.date };
  }
  return null;
}

function suggestion(ex) {
  const last = lastEntryFor(ex.id);
  if (!last) return { kind: "new", text: ex && ex.pesoInicial
    ? `Primer registro. Empieza con unos ${ex.pesoInicial} kg en el extremo bajo del rango con buena técnica.`
    : "Primer registro. Empieza en el extremo bajo del rango con buena técnica." };
  const reps = entryReps(last.entry);
  const weight = workWeight(last.entry);
  if (!reps.length) return { kind: "hold", text: `Última vez con ${weight ?? "?"} kg. Anota tus reps por serie para ver la progresión.` };

  const repsStr = reps.join("·");
  const allHigh = reps.length >= ex.sets && reps.every((r) => r >= ex.repHigh);

  if (ex.unit === "seg") {
    if (allHigh) return { kind: "up", text: `Aguantaste ${repsStr} s en todas las series. Sube a ${ex.repHigh + 10} s o añade carga.` };
    return { kind: "hold", text: `Última vez ${repsStr} s. Suma segundos en las series flojas hasta ${ex.repHigh} s.` };
  }
  if (allHigh) {
    if (weight != null && weight >= DUMBBELL_CAP_KG) {
      return { kind: "cap", text: `${repsStr} reps con ${weight} kg (tu tope) en todas las series. Progresa con más reps, excéntrica de 3-4 s o versión a una pierna/un brazo.` };
    }
    const next = weight != null ? weight + (weight < 5 ? 1 : 2) : null;
    return { kind: "up", text: next != null
      ? `Todas las series al tope (${repsStr}). Sube a ${next} kg y vuelve a ${ex.repLow} reps.`
      : `Todas las series al tope. Sube algo de peso y vuelve a ${ex.repLow} reps.` };
  }
  return { kind: "hold", text: `Última vez ${repsStr} reps${weight != null ? ` · ${weight} kg` : ""}. Mantén el peso y sube reps en las series flojas (objetivo ${ex.repHigh}).` };
}

// ========== helpers de funciones nuevas ==========
// --- grupos musculares por token canónico (del plan) ---
const MUSCLE_ICON = {
  chest: "chest", lats: "lats", "middle back": "lats", "lower back": "lats",
  shoulders: "shoulders", biceps: "biceps", triceps: "triceps",
  quadriceps: "quadriceps", hamstrings: "hamstrings", glutes: "glutes",
  calves: "calves", abdominals: "abdominals", "hip flexors": "abdominals",
};
function muscleIconSrc(ex) {
  const t = ex && ex.mainTokens && ex.mainTokens[0];
  const f = t && MUSCLE_ICON[t];
  return f ? `img/musculos/${f}.png` : "";
}

const TOKEN_GROUP = {
  chest: "Pecho",
  lats: "Espalda", "middle back": "Espalda", "lower back": "Espalda", traps: "Espalda",
  shoulders: "Hombros",
  biceps: "Bíceps", forearms: "Antebrazo", triceps: "Tríceps",
  quadriceps: "Cuádriceps", hamstrings: "Femoral", glutes: "Glúteo", calves: "Gemelos",
  abdominals: "Core", "hip flexors": "Core",
};
const GROUP_ORDER = ["Pecho","Espalda","Hombros","Bíceps","Tríceps","Antebrazo","Cuádriceps","Femoral","Glúteo","Gemelos","Core","Otros"];

// objetivo de volumen por grupo (sumando los tokens del plan)
const GROUP_TARGET = (() => {
  const t = {};
  Object.entries(VOLUME_TARGET || {}).forEach(([tok, v]) => { const g = TOKEN_GROUP[tok] || "Otros"; t[g] = (t[g] || 0) + v; });
  Object.keys(t).forEach((g) => { t[g] = Math.round(t[g] * 2) / 2; });
  return t;
})();

// --- volumen semanal por músculo (usa el estímulo por serie del plan) ---
function weeklyVolume(weekStartISO) {
  const { start, end } = weekRange(weekStartISO);
  const acc = {};
  const add = (g, sets, vol) => { if (!acc[g]) acc[g] = { group: g, sets: 0, vol: 0 }; acc[g].sets += sets; acc[g].vol += vol; };
  state.sessions.forEach((s) => {
    if (s.date < start || s.date > end) return;
    Object.entries(s.entries || {}).forEach(([exId, e]) => {
      const ex = EXERCISE_INDEX[exId]; if (!ex) return;
      const sets = entryReps(e).length, vol = entryVolume(e);
      const est = ex.estimulo && Object.keys(ex.estimulo).length ? ex.estimulo : null;
      if (est) {
        Object.entries(est).forEach(([t, w]) => add(TOKEN_GROUP[t] || "Otros", sets * w, vol * w));
      } else {
        (ex.mainTokens || []).forEach((t) => add(TOKEN_GROUP[t] || "Otros", sets, vol));
        (ex.secTokens || []).forEach((t) => add(TOKEN_GROUP[t] || "Otros", sets * 0.5, vol * 0.5));
      }
    });
  });
  // incluir grupos con objetivo aunque no se hayan entrenado
  Object.keys(GROUP_TARGET).forEach((g) => { if (!acc[g]) acc[g] = { group: g, sets: 0, vol: 0 }; });
  Object.values(acc).forEach((g) => { g.sets = Math.round(g.sets * 2) / 2; g.vol = Math.round(g.vol); g.target = GROUP_TARGET[g.group] || 0; });
  return { start, end, groups: Object.values(acc).sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)) };
}

// total de series efectivas (ponderadas) de una semana
function weekTotalSets(weekStartISO) {
  return weeklyVolume(weekStartISO).groups.reduce((a, g) => a + g.sets, 0);
}

// --- 1RM estimado (Epley) ---
function epley(weight, reps) { return (weight != null && reps > 0) ? weight * (1 + reps / 30) : 0; }
function bestE1RM(exId) {
  let best = 0, date = null;
  state.sessions.forEach((s) => {
    const e = s.entries && s.entries[exId]; if (!e) return;
    const w = workWeight(e); if (w == null) return;
    entryReps(e).forEach((r) => { const v = epley(w, r); if (v > best) { best = v; date = s.date; } });
  });
  return { value: best, date };
}

// --- favoritos (preferencia local) ---
function loadFavorites() { try { return JSON.parse(localStorage.getItem("carga_favs") || "{}") || {}; } catch (_) { return {}; } }
function saveFavorites() { try { localStorage.setItem("carga_favs", JSON.stringify(state.favorites)); } catch (_) {} }
function isFav(exId) { return !!state.favorites[exId]; }

// --- racha de semanas con al menos una sesión ---
function weekStreak() {
  if (!state.sessions.length) return 0;
  const weeks = new Set(state.sessions.map((s) => weekRange(s.date).start));
  let streak = 0;
  let cur = weekRange(todayISO()).start;
  // si no hay nada esta semana, empezamos a contar desde la semana pasada
  if (!weeks.has(cur)) cur = addDaysISO(cur, -7);
  while (weeks.has(cur)) { streak++; cur = addDaysISO(cur, -7); }
  return streak;
}

// racha de semanas que termina en la semana indicada (para el resumen de semanas pasadas)
function streakEndingAt(weekStartISO) {
  const weeks = new Set(state.sessions.map((s) => weekRange(s.date).start));
  let streak = 0, cur = weekRange(weekStartISO).start;
  while (weeks.has(cur)) { streak++; cur = addDaysISO(cur, -7); }
  return streak;
}
// mejor marca comparable de un ejercicio en una sesión (e1RM para reps, segundos para tiempo)
function exMetricInSession(ex, e) {
  if (ex.unit === "seg") { const r = entryReps(e); return r.length ? Math.max(...r) : 0; }
  const w = workWeight(e), reps = entryReps(e);
  if (w == null || !reps.length) return 0;
  return Math.max(...reps.map((r) => epley(w, r)));
}
// resumen semanal: adherencia, volumen, PRs nuevos
function weeklyRecap(weekStartISO) {
  const { start, end } = weekRange(weekStartISO);
  const wk = state.sessions.filter((s) => s.date >= start && s.date <= end);
  const vol = weeklyVolume(weekStartISO);
  const totalSets = Math.round(vol.groups.reduce((a, g) => a + g.sets, 0) * 2) / 2;
  const totalVol = Math.round(vol.groups.reduce((a, g) => a + g.vol, 0));
  const durationTotal = wk.reduce((a, s) => a + (s.durationSec || 0), 0);
  const exIds = new Set(); wk.forEach((s) => Object.keys(s.entries || {}).forEach((id) => exIds.add(id)));
  const prs = [];
  exIds.forEach((id) => {
    const ex = EXERCISE_INDEX[id]; if (!ex) return;
    let before = 0, during = 0;
    state.sessions.forEach((s) => {
      const e = s.entries && s.entries[id]; if (!e) return;
      const v = exMetricInSession(ex, e);
      if (s.date < start) { if (v > before) before = v; }
      else if (s.date <= end) { if (v > during) during = v; }
    });
    if (during > before + 1e-6 && during > 0) prs.push({ id, name: ex.name });
  });
  return { start, end, sessionCount: wk.length, target: DAYS.length, totalSets, totalVol,
    durationTotal, groups: vol.groups.filter((g) => g.target || g.sets), prs, streak: streakEndingAt(weekStartISO) };
}

// --- ejercicios listos para subir peso (doble progresión cumplida) ---
function readyToProgress() {
  const out = [];
  DAYS.forEach((d) => d.exercises.forEach((base) => {
    const ex = resolveExercise(base);
    if (suggestion(ex).kind === "up") out.push({ id: base.id, name: ex.name, day: d.name });
  }));
  return out;
}

// --- récords personales por ejercicio ---
function bestFor(exId, excludeId) {
  let weight = 0, volume = 0, repsMax = 0, dW = null, dV = null, dR = null;
  state.sessions.forEach((s) => {
    if (excludeId && s.id === excludeId) return;
    const e = s.entries && s.entries[exId]; if (!e) return;
    const w = workWeight(e), v = entryVolume(e), reps = entryReps(e);
    const rm = reps.length ? Math.max(...reps) : 0;
    if (w != null && w > weight) { weight = w; dW = s.date; }
    if (v > volume) { volume = v; dV = s.date; }
    if (rm > repsMax) { repsMax = rm; dR = s.date; }
  });
  return { weight, volume, repsMax, dW, dV, dR };
}

// --- descanso prescrito → segundos (usa el valor numérico del plan) ---
function restSeconds(ex) {
  if (ex && ex.restMin) return ex.restMin;
  const d = (ex && ex.descanso) || "";
  const mn = d.match(/(\d+)\s*(?:[-–]\s*\d+)?\s*min/i);
  if (mn) return parseInt(mn[1], 10) * 60;
  const sc = d.match(/(\d+)\s*s/i);
  if (sc) return parseInt(sc[1], 10);
  return 90;
}

// --- auto-descanso (preferencia local) ---
function autoRestOn() { try { return localStorage.getItem("carga_autorest") !== "0"; } catch (_) { return true; } }
function setAutoRest(v) { try { localStorage.setItem("carga_autorest", v ? "1" : "0"); } catch (_) {} }

// --- exportar / backup ---
function download(name, text, mime) {
  const blob = new Blob([text], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
function csvCell(v) { v = String(v == null ? "" : v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function exportCSV() {
  const rows = [["fecha","dia","ejercicio","peso_kg","reps","volumen_kgrep","duracion_seg","notas"]];
  [...state.sessions].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((s) => {
    Object.entries(s.entries || {}).forEach(([exId, e]) => {
      const ex = EXERCISE_INDEX[exId];
      rows.push([s.date, s.dayName, ex ? ex.name : exId, workWeight(e) == null ? "" : workWeight(e),
        entryReps(e).join(" "), entryVolume(e), s.durationSec || "", (e.notas || "").replace(/\s+/g, " ")]);
    });
  });
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  download(`otra-repe-${todayISO()}.csv`, "\ufeff" + csv, "text/csv");
}
function exportJSON() {
  const data = { app: "Otra Repe", exportedAt: new Date().toISOString(),
    variants: state.variants, sessions: state.sessions };
  download(`otra-repe-backup-${todayISO()}.json`, JSON.stringify(data, null, 2), "application/json");
}

// --- recordatorios (mejor esfuerzo mientras la app está abierta) ---
const DEFAULT_REM = { enabled: false, days: [0, 1, 3, 4], time: "18:00" };
function loadReminders() { try { return Object.assign({}, DEFAULT_REM, JSON.parse(localStorage.getItem("carga_reminders") || "{}")); } catch (_) { return { ...DEFAULT_REM }; } }
function saveReminders(r) { try { localStorage.setItem("carga_reminders", JSON.stringify(r)); } catch (_) {} }
let reminderTimer = null;
function applyReminders() {
  if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; }
  if (!loadReminders().enabled) return;
  reminderTimer = setInterval(reminderTick, 30000); reminderTick();
}
function reminderTick() {
  const r = loadReminders();
  if (!r.enabled || !("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date(); const wd = (now.getDay() + 6) % 7;
  if (!r.days.includes(wd)) return;
  const [hh, mm] = r.time.split(":").map(Number);
  if (now.getHours() !== hh || now.getMinutes() !== mm) return;
  const key = "carga_rem_" + todayISO();
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch (_) {}
  notify("Toca entrenar 💪", "Tienes sesión hoy. Abre Otra Repe y dale.");
}
function notify(title, body) {
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, { body, icon: "icons/icon-192.png" }));
    } else if ("Notification" in window) { new Notification(title, { body }); }
  } catch (_) {}
}

// --- fotos de progreso (guardadas en Firestore, redimensionadas) ---
async function loadProgress() {
  state.progLoaded = false;
  try {
    const snap = await getDocs(query(collection(db, "users", state.user.uid, "progress"), orderBy("date", "desc")));
    state.photos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error(e); state.photos = []; }
  state.progLoaded = true;
}
function resizeImage(file, max = 720, q = 0.7) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      const sc = Math.min(1, max / Math.max(w, h)); w = Math.round(w * sc); h = Math.round(h * sc);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("img")); };
    img.src = url;
  });
}
async function addPhoto(file, dateISO) {
  const img = await resizeImage(file);
  const data = { date: dateISO || todayISO(), img, createdAt: serverTimestamp() };
  const ref = await addDoc(collection(db, "users", state.user.uid, "progress"), data);
  state.photos.unshift({ id: ref.id, ...data });
  state.photos.sort((a, b) => (a.date < b.date ? 1 : -1));
}
async function removePhoto(id) {
  await deleteDoc(doc(db, "users", state.user.uid, "progress", id));
  state.photos = state.photos.filter((p) => p.id !== id);
}

// --- descargar todas las fotos en un .zip (método STORE, sin librerías) ---
const _crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = _crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function dataURLtoBytes(u) {
  const i = u.indexOf(","); const meta = u.slice(0, i), data = u.slice(i + 1);
  if (/;base64/i.test(meta)) { const bin = atob(data); const b = new Uint8Array(bin.length); for (let j = 0; j < bin.length; j++) b[j] = bin.charCodeAt(j); return b; }
  return new TextEncoder().encode(decodeURIComponent(data));
}
function buildZip(files) {
  const u16 = (n) => [n & 255, (n >> 8) & 255], u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255];
  const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0;
  files.forEach((f) => {
    const nameB = enc.encode(f.name), data = f.bytes, crc = crc32(data);
    const local = [0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0)];
    parts.push(new Uint8Array(local), nameB, data);
    central.push({ nameB, crc, size: data.length, offset });
    offset += 30 + nameB.length + data.length;
  });
  const cdStart = offset; const cdParts = [];
  central.forEach((c) => {
    const h = [0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(c.crc), ...u32(c.size), ...u32(c.size), ...u16(c.nameB.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(c.offset)];
    cdParts.push(new Uint8Array(h), c.nameB); offset += 46 + c.nameB.length;
  });
  const eocd = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length), ...u32(offset - cdStart), ...u32(cdStart), ...u16(0)]);
  return new Blob([...parts, ...cdParts, eocd], { type: "application/zip" });
}
function downloadAllPhotos() {
  if (!state.photos.length) return toast("No hay fotos que descargar", true);
  const files = [...state.photos].sort((a, b) => (a.date < b.date ? -1 : 1)).map((p, i) => {
    const ext = /image\/svg/i.test(p.img.slice(0, 30)) ? "svg" : "jpg";
    return { name: `otra-repe-${p.date}-${String(i + 1).padStart(2, "0")}.${ext}`, bytes: dataURLtoBytes(p.img) };
  });
  const blob = buildZip(files);
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `otra-repe-fotos-${todayISO()}.zip`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast(`Descargando ${files.length} fotos`);
}

// --- visor de foto a pantalla completa ---
function openPhoto(id) {
  let cur = state.photos.findIndex((p) => p.id === id); if (cur < 0) return;
  const overlay = document.createElement("div"); overlay.className = "lightbox";
  const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") go2(-1); else if (e.key === "ArrowRight") go2(1); };
  const go2 = (d) => { const n = cur + d; if (n >= 0 && n < state.photos.length) { cur = n; show(); } };
  const show = () => {
    const p = state.photos[cur];
    overlay.innerHTML = `
      <div class="lb-top"><span class="lb-date">${fmtDate(p.date)} · ${cur + 1}/${state.photos.length}</span><button class="lb-close" aria-label="Cerrar">×</button></div>
      <div class="lb-img"><img src="${p.img}" alt=""></div>
      <div class="lb-nav"><button class="lb-prev" ${cur <= 0 ? "disabled" : ""} aria-label="Anterior">‹</button><button class="lb-del">Borrar</button><button class="lb-next" ${cur >= state.photos.length - 1 ? "disabled" : ""} aria-label="Siguiente">›</button></div>`;
    overlay.querySelector(".lb-close").onclick = close;
    overlay.querySelector(".lb-prev").onclick = () => go2(-1);
    overlay.querySelector(".lb-next").onclick = () => go2(1);
    overlay.querySelector(".lb-del").onclick = async () => {
      if (!confirm("¿Borrar esta foto?")) return;
      const delId = state.photos[cur].id;
      try { await removePhoto(delId); toast("Foto borrada"); } catch (_) { toast("No se pudo borrar", true); }
      close(); render();
    };
  };
  overlay.onclick = (e) => { if (e.target === overlay || e.target.classList.contains("lb-img")) close(); };
  document.addEventListener("keydown", onKey);
  $(".frame").appendChild(overlay); show();
}

// ---------- medidas corporales (Firestore: users/{uid}/measures) ----------
async function loadMeasures() {
  state.measLoaded = false;
  try {
    const snap = await getDocs(query(collection(db, "users", state.user.uid, "measures"), orderBy("date", "desc")));
    state.measures = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error(e); state.measures = []; }
  state.measLoaded = true;
}
async function addMeasure(dateISO, values) {
  const clean = {};
  Object.entries(values).forEach(([k, v]) => { const n = num(v); if (n != null) clean[k] = n; });
  if (!Object.keys(clean).length) throw new Error("sin valores");
  const data = { date: dateISO || todayISO(), values: clean, createdAt: serverTimestamp() };
  const ref = await addDoc(collection(db, "users", state.user.uid, "measures"), data);
  state.measures.unshift({ id: ref.id, ...data });
  state.measures.sort((a, b) => (a.date < b.date ? 1 : -1));
}
async function removeMeasure(id) {
  await deleteDoc(doc(db, "users", state.user.uid, "measures", id));
  state.measures = state.measures.filter((m) => m.id !== id);
}
// serie temporal (ascendente) de una métrica
function measureSeries(metric) {
  return state.measures
    .filter((m) => m.values && m.values[metric] != null)
    .map((m) => ({ date: m.date, value: m.values[metric] }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------- imagen del ejercicio (fallback jpg → png → marcador) ----------
window.imgFallback = function (el, id) {
  if (!el.dataset.tried) { el.dataset.tried = "1"; el.src = "img/" + id + ".png"; return; }
  el.style.display = "none";
  const ph = el.nextElementSibling;
  if (ph) ph.style.display = "flex";
};

// ---------- router ----------
function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const parts = h.split("/").filter(Boolean);
  return { name: parts[0] || "days", a: parts[1] || null, b: parts[2] || null };
}
function go(path) { location.hash = path; }
window.addEventListener("hashchange", render);

// ---------- render principal ----------
function render() {
  if (!CONFIGURED) return renderSetupNeeded();
  if (!state.user) return renderLogin();
  if (!state.loaded) return; // se renderiza al terminar de cargar
  const r = parseHash();
  switch (r.name) {
    case "session": return renderSession(r.a);
    case "plan": return renderDayPreview(r.a);
    case "history": return renderHistory(r.a);
    case "day": return renderDayDetail(r.a);
    case "log": return renderLogDetail(r.a);
    case "progress": return renderProgress(r.a, r.b);
    case "principios": return renderPrinciples();
    default: return renderDays();
  }
}

function shell(inner, active) {
  const nav = `
    <nav class="nav">
      <a href="#/days" class="${active==='days'?'active':''}">${I.dumbbell}<span>Entreno</span></a>
      <a href="#/history" class="${active==='history'?'active':''}">${I.history}<span>Historial</span></a>
      <a href="#/progress" class="${active==='progress'?'active':''}">${I.chart}<span>Progreso</span></a>
      <a href="#/principios" class="${active==='principios'?'active':''}">${I.book}<span>Guía</span></a>
    </nav>`;
  root.innerHTML = inner + nav;
}

function topbar(title, eyebrow) {
  const u = state.user;
  const initial = (u.displayName || u.email || "?").trim()[0].toUpperCase();
  const av = u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc(initial);
  return `
    <div class="topbar">
      <div>
        <div class="eyebrow">${esc(eyebrow)}</div>
        <h1 class="h1">${esc(title)}</h1>
      </div>
      <div style="text-align:right">
        <div class="avatar">${av}</div>
        <button class="linkbtn" id="logout">Salir</button>
      </div>
    </div>`;
}

// ---------- vistas ----------
function renderSetupNeeded() {
  root.innerHTML = `
    <div class="login">
      <div class="login-hero">
        <div class="login-kicker">Configuración pendiente</div>
        <h1 class="login-title">Casi<br><em>listo</em></h1>
        <p class="login-lead">Abre <b>firebase-config.js</b> y pega la configuración de tu proyecto de Firebase. Tienes el paso a paso en el README.md.</p>
        <div class="login-meta">
          <span>1 · Crea un proyecto en Firebase</span>
          <span>2 · Activa Authentication (Google) y Firestore</span>
          <span>3 · Copia el bloque firebaseConfig aquí</span>
        </div>
      </div>
      <p class="login-note">Esta pantalla desaparece al guardar tus claves.</p>
    </div>`;
}


function renderLogin() {
  root.innerHTML = `
    <div class="login">
      <div class="login-hero">
        <img class="brandlogo" src="brand-lockup.png" alt="Otra Repe · una repe más" width="1796" height="598">
        <div class="login-kicker">Torso · Pierna · 4 días</div>
        <h1 class="login-title">Levanta.<br>Anota.<br><em>Progresa.</em></h1>
        <p class="login-lead">Tu rutina de hipertrofia y todo tu seguimiento, en el bolsillo. Doble progresión calculada por ti.</p>
        <div class="login-meta">
          <span><b>25</b> ejercicios · <b>4</b> sesiones</span>
          <span>Sincronizado con tu cuenta</span>
        </div>
      </div>
      <div>
        <button class="gbtn" id="gsignin">${I.google} Entrar con Google</button>
        <p class="login-note">Guardamos solo tus entrenos, ligados a tu cuenta.</p>
      </div>
    </div>`;
  $("#gsignin").onclick = doSignIn;
}

function dayLastLabel(dayId) {
  const s = state.sessions.find((x) => x.dayId === dayId);
  return s ? `último: ${fmtDate(s.date)}` : null;
}

function renderDays() {
  const wk = weekRange(todayISO());
  const streak = weekStreak();
  const ready = readyToProgress();
  const panel = `
    <div class="homepanel">
      <div class="hp-stat">
        <div class="hp-big">${streak}</div>
        <div class="hp-lbl">${streak === 1 ? "semana" : "semanas"} de racha</div>
      </div>
      <button class="hp-stat ${ready.length ? "go" : ""}" ${ready.length ? `data-go="#/progress/pr"` : ""}>
        <div class="hp-big">${ready.length}</div>
        <div class="hp-lbl">${ready.length === 1 ? "ejercicio listo" : "listos"} para subir peso</div>
      </button>
    </div>`;
  const cards = DAYS.map((d, i) => {
    const last = dayLastLabel(d.id);
    const done = state.sessions.some((s) => s.dayId === d.id && s.date >= wk.start && s.date <= wk.end);
    return `
      <button class="daycard ${done ? "done" : ""}" data-group="${d.group}" data-go="#/plan/${d.id}">
        ${done ? `<span class="wkdone">✓ Hecho</span>` : `<span class="didx">${i + 1}</span>`}
        <span class="grp">${d.group === "torso" ? "Torso" : "Pierna"}</span>
        <div class="dname">${esc(d.name)}</div>
        <div class="dmeta">${d.exercises.length} ejercicios${d.durMin ? ` · ~${d.durMin} min` : ""}</div>
        <div class="last ${last ? "" : "none"}">${last ? "● " + last : "○ sin registros"}</div>
      </button>`;
  }).join("");
  shell(`
    <div class="screen">
      ${topbar("Elige tu día", "Hoy entrenas")}
      ${panel}
      <p class="weeknote">Semana del ${fmtDate(wk.start)} al ${fmtDate(wk.end)} · marcados los que ya hiciste</p>
      <div class="daylist">${cards}</div>
      <div class="divider"><span class="label">Recuerda</span><span class="rule"></span></div>
      <p class="sub">Cada grupo muscular, 2 veces por semana. Calienta 5 min antes de empezar.</p>
    </div>`, "days");
  bindCommon();
  document.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => go(b.dataset.go));
}

// ---------- vista previa del día (antes de empezar) ----------
function renderDayPreview(dayId) {
  const day = DAYS.find((d) => d.id === dayId);
  if (!day) return go("#/days");
  const rows = day.exercises.map((base) => {
    const ex = resolveExercise(base);
    const last = lastEntryFor(base.id);
    const lastTxt = last ? formatSets(ex, last.entry) : "sin registros";
    const micon = muscleIconSrc(ex);
    return `
      <div class="pp-row">
        ${micon ? `<img class="micon sm" src="${micon}" alt="${esc(ex.mainMuscle)}" loading="lazy">` : ""}
        <div class="pp-main">
          <div class="pp-name">${isFav(base.id) ? "★ " : ""}${esc(ex.name)}${ex.isVariant ? ` <span class="vbadge">variante</span>` : ""}</div>
          <div class="pp-sub">${esc(ex.scheme)} · ${esc(ex.mainMuscle)}</div>
          <div class="pp-last">${last ? "● " : "○ "}${esc(lastTxt)}</div>
        </div>
        ${base.variant ? `<button class="chip swap" data-swap="${base.id}">${I.swap}</button>` : ""}
      </div>`;
  }).join("");
  shell(`
    <div class="screen">
      <button class="linkbtn" data-go="#/days">← Días</button>
      ${topbar(day.name, "Vista previa")}
      <div class="pp-meta">${day.exercises.length} ejercicios${day.durMin ? ` · ~${day.durMin} min estimados` : ""}</div>
      <div class="pplist">${rows}</div>
      <div class="save-row"><button class="btn btn-primary" id="startday">Empezar sesión</button></div>
    </div>`, "days");
  bindCommon();
  document.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => go(b.dataset.go));
  document.querySelectorAll("[data-swap]").forEach((b) => b.onclick = () => {
    const id = b.dataset.swap; state.variants[id] = !state.variants[id]; saveVariants(); render();
  });
  $("#startday").onclick = () => go("#/session/" + day.id);
}

// ---------- sesión: un ejercicio por pantalla ----------
let draft = null; // { dayId, date, idx, entries: { exId: {peso, reps:[], notas} } }

function initDraft(dayId) { draft = { dayId, date: todayISO(), idx: 0, entries: {}, pendingCue: false, startedAt: Date.now() }; }

function captureStep(day) {
  if (!draft || draft.idx >= day.exercises.length) return;
  const ex = day.exercises[draft.idx];
  const card = document.querySelector(".exercise");
  if (!card) return;
  const pesoEl = card.querySelector('[data-field="peso"]');
  const peso = pesoEl ? pesoEl.value.trim() : "";
  const reps = [];
  card.querySelectorAll('[data-field="reps"]').forEach((inp) => {
    const v = inp.value.trim(); reps.push(v === "" ? null : Number(v));
  });
  const notasEl = card.querySelector('[data-field="notas"]');
  draft.entries[ex.id] = { peso: peso === "" ? null : Number(peso), reps, notas: notasEl ? notasEl.value.trim() : "" };
}

function renderSession(dayId) {
  const day = DAYS.find((d) => d.id === dayId);
  if (!day) return go("#/days");
  if (!draft || draft.dayId !== dayId) { initDraft(dayId); draft.pendingCue = true; }
  if (draft.idx >= day.exercises.length) return renderSessionSummary(day);
  if (draft.pendingCue) return renderCue(day);
  renderStep(day);
}

// pantalla previa: pista del ejercicio que viene (a pantalla completa, ~7 s)
function renderCue(day) {
  const ex = day.exercises[draft.idx];
  const list = (ex.cues && ex.cues.length) ? ex.cues : ["Ahora toca " + ex.name + "."];
  const text = list[Math.floor(Math.random() * list.length)];
  root.innerHTML = `
    <div class="cue" id="cue">
      <img class="cue-logo" src="brand-lockup.png" alt="Otra Repe">
      <div class="cue-eyebrow">Siguiente · ${draft.idx + 1}/${day.exercises.length}</div>
      <div class="cue-text">${esc(text)}</div>
      <div class="cue-hint">toca para continuar</div>
      <div class="cue-bar"><div class="cue-bar-fill"></div></div>
    </div>`;
  const proceed = () => { if (!draft || !draft.pendingCue) return; draft.pendingCue = false; renderStep(day); window.scrollTo(0, 0); };
  const t = setTimeout(proceed, 7000);
  $("#cue").onclick = () => { clearTimeout(t); proceed(); };
}

function renderStep(day) {
  const total = day.exercises.length;
  const i = draft.idx;
  const base = day.exercises[i];
  const ex = resolveExercise(base);
  const sug = suggestion(ex);
  const last = lastEntryFor(ex.id);
  const saved = draft.entries[ex.id];
  const range = `${ex.repLow}-${ex.repHigh}`;
  const unitLabel = ex.unit === "seg" ? "seg" : "reps";

  const pesoVal = saved && saved.peso != null ? saved.peso
    : (last && workWeight(last.entry) != null ? workWeight(last.entry) : "");
  const lastRepsRaw = last && last.entry && Array.isArray(last.entry.reps) ? last.entry.reps : [];
  const repVal = (k) => (saved && saved.reps && saved.reps[k] != null) ? saved.reps[k]
    : (lastRepsRaw[k] != null ? lastRepsRaw[k] : "");

  const lastReps = last ? entryReps(last.entry) : [];
  const gate = lastReps.length ? Math.min(...lastReps) : null;
  const pct = gate != null ? Math.max(0, Math.min(1, (gate - ex.repLow) / Math.max(1, ex.repHigh - ex.repLow))) : 0;
  const full = gate != null && gate >= ex.repHigh;

  const isDone = (k) => {
    const e = draft.entries[day.exercises[k].id];
    return !!e && (workWeight(e) != null || entryReps(e).length > 0);
  };
  const dots = day.exercises.map((_, k) =>
    `<button class="dot ${k === i ? "now" : isDone(k) ? "done" : ""}" data-jump="${k}" aria-label="Ir al ejercicio ${k + 1}"></button>`).join("");

  const repCells = Array.from({ length: ex.sets }).map((_, k) => `
    <div class="repcell">
      <span>S${k + 1}</span>
      <input type="number" inputmode="numeric" data-field="reps" value="${esc(repVal(k))}" placeholder="${ex.unit === "seg" ? "seg" : range}">
    </div>`).join("");

  const micon = muscleIconSrc(ex);
  const muscles = `<div class="muscles-row">
      ${micon ? `<img class="micon" src="${micon}" alt="${esc(ex.mainMuscle)}" loading="lazy">` : ""}
      <div class="muscles">
        <span class="mtag main">${esc(ex.mainMuscle)}</span>
        ${ex.secMuscles.map((m) => `<span class="mtag">${esc(m)}</span>`).join("")}
      </div>
    </div>`;

  const weightBox = ex.unit === "seg" ? "" : `
    <div class="weightbox">
      <label>Peso (kg) · el mismo para todas las series</label>
      <div class="unit"><input type="number" inputmode="decimal" step="0.5" data-field="peso" value="${esc(pesoVal)}" placeholder="—"><span class="suf">kg</span></div>
    </div>`;

  // foto/demostración: imagen del ejercicio o de su variante (Free Exercise DB / GIF)
  const demoImgs = exerciseImages(ex.id, ex.isVariant);
  let photoHtml;
  if (demoImgs.length) {
    const frames = demoImgs.map((src, k) =>
      `<img class="fr fr${k}" src="${src}" alt="${k === 0 ? esc(ex.name) : ""}" ${k === 0 ? `onload="this.parentElement.querySelector('.photo-ph').style.display='none'" onerror="this.style.display='none'"` : `onerror="this.style.display='none'"`}>`
    ).join("");
    photoHtml = `<div class="photo demo">
          <div class="photo-ph">${I.image}<span>Demostración no disponible</span></div>
          ${frames}
          <span class="photo-src">${esc(exerciseSource(ex.id, ex.isVariant))}</span>
        </div>`;
  } else {
    const localSrc = ex.isVariant ? `img/${ex.id}_v.jpg` : `img/${ex.id}.jpg`;
    photoHtml = `<div class="photo">
          <img src="${localSrc}" alt="${esc(ex.name)}" onload="this.nextElementSibling.style.display='none'" onerror="imgFallback(this, '${ex.id}${ex.isVariant ? "_v" : ""}')">
          <div class="photo-ph">${I.image}<span>${ex.isVariant ? "Foto de la variante" : "Foto del ejercicio"}</span></div>
        </div>`;
  }

  shell(`
    <div class="screen">
      <div class="step-head">
        <button class="linkbtn" id="exitsession">← Salir</button>
        ${sessClockHtml()}
        <div class="step-count">${i + 1} / ${total}</div>
      </div>
      <div class="stepper">${dots}</div>

      <div class="exercise" data-ex="${ex.id}">
        ${photoHtml}

        <div class="ex-top">
          <div class="ex-name">${esc(ex.name)}</div>
          <div class="ex-scheme">${esc(ex.scheme)}<span class="rir">RIR ${esc(ex.rir)}</span></div>
        </div>

        <div class="ex-meta">${I.clock} Descanso ${esc(ex.descanso || "—")} · Tempo ${esc(ex.tempo || "—")}</div>

        <div class="tagrow">
          ${ex.tipo ? `<span class="tag">${esc(cap(ex.tipo))}</span>` : ""}
          ${ex.prioridad ? `<span class="tag">${esc(cap(ex.prioridad))}</span>` : ""}
          ${ex.fatiga ? `<span class="tag fat-${esc(ex.fatiga)}">Fatiga ${esc(ex.fatiga)}</span>` : ""}
          ${ex.tipoCarga === "axial" ? `<span class="tag">Carga axial</span>` : ""}
          ${(ex.etiquetas || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
          <button class="fav ${isFav(base.id) ? "on" : ""}" data-fav="${base.id}" aria-label="Favorito">${isFav(base.id) ? "★" : "☆"}</button>
        </div>

        ${muscles}

        ${base.variant ? `<div class="swap-note">${ex.isVariant
            ? `↳ Variante de <b>${esc(base.name)}</b>`
            : `Alternativa: <b>${esc(base.variant.name)}</b>`}</div>` : ""}

        ${ex.calienta ? `<div class="warmup">${I.clock} ${esc(ex.calientaTxt || "Haz 1-2 series de aproximación antes de las efectivas.")}</div>` : ""}

        <div class="ex-tools">
          <a class="chip" href="${ex.video || videoUrl(ex.name)}" target="_blank" rel="noopener">${I.play} Vídeo</a>
          <button class="chip" data-ejec="${ex.id}">Cómo se hace</button>
          <button class="chip" data-err="${ex.id}">Errores a evitar</button>
          ${ex.unit === "seg" ? `<button class="chip" data-timer="${ex.repHigh}">${I.clock} ${ex.repHigh} s</button>` : ""}
          ${base.variant ? `<button class="chip swap" data-swap="${base.id}">${I.swap} ${ex.isVariant ? "Usar original" : "Cambiar ejercicio"}</button>` : ""}
        </div>

        <div class="ejec collapse" data-ejecbox="${ex.id}">${howToHtml(ex)}</div>
        <div class="ejec err collapse" data-errbox="${ex.id}">${esc(ex.error || "Sin indicaciones.")}</div>

        <div class="suggest ${sug.kind === "up" ? "up" : sug.kind === "cap" ? "cap" : ""}">
          <span class="ico">${sug.kind === "up" ? "↑" : sug.kind === "cap" ? "10kg" : sug.kind === "new" ? "•" : "→"}</span>
          <span>${esc(sug.text)}</span>
        </div>

        <div class="track-wrap">
          <div class="track-head">
            <span>${ex.repLow}</span>
            <span class="now">${lastReps.length ? "última: " + lastReps.join("·") + " " + unitLabel : "sin registro"}</span>
            <span>${ex.repHigh}</span>
          </div>
          <div class="track ${full ? "full" : ""}">
            <div class="fill" style="width:${(pct * 100).toFixed(0)}%"></div>
            <div class="mark" style="left:${(pct * 100).toFixed(0)}%"></div>
          </div>
        </div>

        ${weightBox}
        <div class="reps-lbl">${ex.unit === "seg" ? "Segundos por serie" : "Reps por serie (" + range + ")"}</div>
        <div class="reps-grid">${repCells}</div>
        <div class="field full" style="margin-top:14px">
          <label>Notas del ejercicio</label>
          <textarea data-field="notas" placeholder="Sensaciones, técnica, RIR real…">${esc(saved ? saved.notas || "" : "")}</textarea>
        </div>
      </div>

      <div class="step-nav">
        ${i > 0 ? `<button class="btn btn-ghost" id="prev">Anterior</button>` : `<span></span>`}
        <button class="btn btn-primary" id="next">${i === total - 1 ? "Hecho · Resumen" : "Hecho · Siguiente"}</button>
      </div>
    </div>
    <button class="fab" id="opentimer" aria-label="Temporizador">${I.clock}</button>`, "days");

  bindCommon();
  $("#exitsession").onclick = () => go("#/days");
  document.querySelectorAll("[data-jump]").forEach((d) => d.onclick = () => { captureStep(day); draft.idx = +d.dataset.jump; draft.pendingCue = false; render(); window.scrollTo(0, 0); });
  document.querySelectorAll("[data-ejec]").forEach((b) => b.onclick = () => $(`[data-ejecbox="${b.dataset.ejec}"]`).classList.toggle("open"));
  document.querySelectorAll("[data-err]").forEach((b) => b.onclick = () => $(`[data-errbox="${b.dataset.err}"]`).classList.toggle("open"));
  document.querySelectorAll("[data-fav]").forEach((b) => b.onclick = () => {
    const id = b.dataset.fav; state.favorites[id] = !state.favorites[id]; if (!state.favorites[id]) delete state.favorites[id];
    saveFavorites(); render();
  });
  document.querySelectorAll("[data-swap]").forEach((b) => b.onclick = () => {
    captureStep(day);
    const id = b.dataset.swap;
    state.variants[id] = !state.variants[id];
    saveVariants();
    render(); window.scrollTo(0, 0);
  });
  document.querySelectorAll("[data-timer]").forEach((b) => b.onclick = () => openTimer(+b.dataset.timer));
  $("#opentimer").onclick = () => openTimer(restSeconds(ex));
  // auto-descanso: al anotar una serie, abre y arranca el temporizador con el descanso del ejercicio
  document.querySelectorAll('.exercise [data-field="reps"]').forEach((inp) => inp.addEventListener("change", () => {
    if (autoRestOn() && inp.value.trim() !== "") { openTimer(restSeconds(ex)); startTick(); }
  }));
  const prev = $("#prev"); if (prev) prev.onclick = () => { captureStep(day); draft.idx--; draft.pendingCue = false; render(); window.scrollTo(0, 0); };
  $("#next").onclick = () => {
    captureStep(day);
    const wasLast = draft.idx === day.exercises.length - 1;
    draft.idx++;
    draft.pendingCue = !wasLast;   // sin pista antes del resumen
    render(); window.scrollTo(0, 0);
  };
  startSessionClock();
}

function renderSessionSummary(day) {
  const rows = day.exercises.map((base, k) => {
    const ex = resolveExercise(base);
    const e = draft.entries[ex.id];
    const has = e && entryHasData(e);
    return `<button class="sumrow ${has ? "" : "skip"}" data-edit="${k}">
        <div class="sumname">${esc(ex.name)}${ex.isVariant ? ` <span class="vbadge">variante</span>` : ""}</div>
        <div class="sumval">${has ? esc(formatSets(ex, e)) : "sin registrar"}</div>
        <span class="sumedit">Editar</span>
      </button>`;
  }).join("");

  const editing = !!(draft && draft.editingId);
  if (!draft.check) draft.check = { energia: null, sueno: null };
  const scale = (key, label) => `
    <div class="checkrow">
      <span class="check-lbl">${label}</span>
      <div class="check-dots">${[1,2,3,4,5].map((n) =>
        `<button class="ckdot ${draft.check[key] === n ? "on" : ""}" data-check="${key}" data-val="${n}">${n}</button>`).join("")}</div>
    </div>`;
  shell(`
    <div class="screen">
      <div class="step-head">
        <button class="linkbtn" id="backlast">← Volver</button>
        ${editing ? `<span class="step-count">Editando</span>` : sessClockHtml()}
        <div class="step-count">Resumen</div>
      </div>
      ${topbar(editing ? "Editar sesión" : "Sesión completa", editing ? "Corrige y actualiza" : "Revisa y guarda")}
      <label class="date" style="margin-bottom:14px">${I.clock}<input type="date" id="sdate" value="${draft.date}"></label>
      <div class="sumlist">${rows}</div>
      <div class="checkcard">
        <div class="check-h">¿Cómo te has encontrado? <span>opcional</span></div>
        ${scale("energia", "Energía")}
        ${scale("sueno", "Sueño")}
      </div>
      <div class="save-row">
        <button class="btn btn-primary" id="save">${editing ? "Actualizar sesión" : "Guardar sesión"}</button>
        <p class="save-hint">Toca un ejercicio para editarlo. Lo que dejes sin registrar no se guarda.</p>
      </div>
    </div>`, "days");

  bindCommon();
  $("#backlast").onclick = () => { draft.idx = day.exercises.length - 1; render(); window.scrollTo(0, 0); };
  document.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => { draft.idx = +b.dataset.edit; render(); window.scrollTo(0, 0); });
  document.querySelectorAll("[data-check]").forEach((b) => b.onclick = () => {
    const key = b.dataset.check, val = +b.dataset.val;
    draft.check[key] = draft.check[key] === val ? null : val;
    document.querySelectorAll(`[data-check="${key}"]`).forEach((x) => x.classList.toggle("on", +x.dataset.val === draft.check[key]));
  });
  $("#sdate").onchange = (e) => { draft.date = e.target.value || todayISO(); };
  $("#save").onclick = () => saveSession(day);
  startSessionClock();
}

async function saveSession(day) {
  const btn = $("#save");
  const date = (draft && draft.date) || todayISO();
  const editingId = draft && draft.editingId;
  const entries = {};
  for (const ex of day.exercises) {
    const e = draft.entries[ex.id];
    if (e && entryHasData(e)) entries[ex.id] = { peso: e.peso ?? null, reps: e.reps || [], notas: e.notas || "" };
  }
  if (Object.keys(entries).length === 0) { toast("Registra al menos un ejercicio", true); return; }

  // récords: comparar con lo mejor previo (excluyendo la propia sesión si se edita)
  const prNames = [];
  for (const [exId, e] of Object.entries(entries)) {
    const ex = EXERCISE_INDEX[exId]; if (!ex) continue;
    const b = bestFor(exId, editingId);
    const reps = entryReps(e), rm = reps.length ? Math.max(...reps) : 0;
    const isPR = ex.unit === "seg"
      ? rm > (b.repsMax || 0)
      : ((workWeight(e) != null && workWeight(e) > (b.weight || 0)) || entryVolume(e) > (b.volume || 0));
    if (isPR) prNames.push(ex.name);
  }

  const durationSec = editingId
    ? (draft.baseDuration ?? null)
    : (draft && draft.startedAt ? Math.round((Date.now() - draft.startedAt) / 1000) : null);
  const check = (draft.check && (draft.check.energia || draft.check.sueno)) ? draft.check : null;
  btn.disabled = true; btn.textContent = "Guardando…";
  try {
    if (editingId) {
      await updateDoc(doc(db, "users", state.user.uid, "sessions", editingId),
        { dayId: day.id, dayName: day.name, date, entries, durationSec, check });
      const idx = state.sessions.findIndex((s) => s.id === editingId);
      if (idx >= 0) state.sessions[idx] = { id: editingId, dayId: day.id, dayName: day.name, date, entries, durationSec, check };
    } else {
      const ref = await addDoc(collection(db, "users", state.user.uid, "sessions"), {
        dayId: day.id, dayName: day.name, date, entries, durationSec, check, createdAt: serverTimestamp(),
      });
      state.sessions.unshift({ id: ref.id, dayId: day.id, dayName: day.name, date, entries, durationSec, check });
    }
    state.sessions.sort((a, b) => (a.date < b.date ? 1 : -1));
    stopSessionClock();
    draft = null;
    if (prNames.length) {
      toast(`🎉 ¡Récord en ${prNames.slice(0, 2).join(" y ")}${prNames.length > 2 ? "…" : ""}!`);
    } else {
      toast(editingId ? "Sesión actualizada" : (durationSec != null ? `Sesión guardada · ${fmtDur(durationSec * 1000)} 💪` : "Sesión guardada 💪"));
    }
    go(editingId ? "#/day/" + date : "#/days");
  } catch (e) {
    console.error(e);
    toast("No se pudo guardar. Revisa las reglas de Firestore.", true);
    btn.disabled = false; btn.textContent = "Guardar sesión";
  }
}

function renderHistory(ym) {
  const today = todayISO();
  const [ty, tm] = today.split("-").map(Number);
  let [y, m] = (ym && /^\d{4}-\d{2}$/.test(ym)) ? ym.split("-").map(Number)
    : (state.sessions[0] ? state.sessions[0].date.slice(0, 7).split("-").map(Number) : [ty, tm]);

  const byDate = {};
  state.sessions.forEach((s) => { (byDate[s.date] = byDate[s.date] || []).push(s); });

  const first = new Date(y, m - 1, 1);
  const startWd = (first.getDay() + 6) % 7;             // lunes = 0
  const daysInMonth = new Date(y, m, 0).getDate();
  const pad = (n) => String(n).padStart(2, "0");
  const prevYM = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const nextYM = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
  const atCurrent = (y > ty) || (y === ty && m >= tm);  // no avanzar más allá del mes actual

  const cells = [];
  for (let i = 0; i < startWd; i++) cells.push(`<div class="cal-cell empty"></div>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${y}-${pad(m)}-${pad(d)}`;
    const ss = byDate[date] || [];
    const isToday = date === today;
    if (ss.length) {
      const dots = ss.slice(0, 3).map((s) => {
        const day = DAYS.find((x) => x.id === s.dayId);
        return `<i class="cdot ${day ? day.group : "torso"}"></i>`;
      }).join("");
      cells.push(`<button class="cal-cell has ${isToday ? "today" : ""}" data-go="#/day/${date}"><span class="cnum">${d}</span><span class="cdots">${dots}</span></button>`);
    } else {
      cells.push(`<div class="cal-cell ${isToday ? "today" : ""}"><span class="cnum">${d}</span></div>`);
    }
  }

  const wd = ["L", "M", "X", "J", "V", "S", "D"].map((x) => `<div class="cal-wd">${x}</div>`).join("");

  const monthSessions = state.sessions
    .filter((s) => s.date.startsWith(`${y}-${pad(m)}`))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const list = monthSessions.length
    ? `<div class="hist">` + monthSessions.map((s) => {
        const n = Object.keys(s.entries || {}).length;
        const [, mm, dd] = s.date.split("-");
        return `<button class="histcard" data-go="#/day/${s.date}"><div class="d"><b>${+dd}</b>${MES[+mm - 1]}</div><div class="info"><div class="n">${esc(s.dayName)}</div><div class="s">${n} ejercicio${n === 1 ? "" : "s"}</div></div></button>`;
      }).join("") + `</div>`
    : `<p class="sub" style="margin-top:16px">Sin sesiones este mes.</p>`;

  shell(`
    <div class="screen">
      ${topbar("Historial", "Tu calendario")}
      <div class="cal">
        <div class="cal-head">
          <button class="cal-nav" data-go="#/history/${prevYM}" aria-label="Mes anterior">‹</button>
          <div class="cal-title">${monthLabel(y, m)}</div>
          <button class="cal-nav ${atCurrent ? "disabled" : ""}" ${atCurrent ? "disabled" : `data-go="#/history/${nextYM}"`} aria-label="Mes siguiente">›</button>
        </div>
        <div class="cal-grid cal-wds">${wd}</div>
        <div class="cal-grid">${cells.join("")}</div>
        <div class="cal-legend"><span><i class="cdot torso"></i>Torso</span><span><i class="cdot pierna"></i>Pierna</span></div>
      </div>
      ${list}
    </div>`, "history");
  bindCommon();
  document.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => go(b.dataset.go));
}

function renderDayDetail(date) {
  if (!date) return go("#/history");
  const ym = date.slice(0, 7);
  const ss = state.sessions.filter((s) => s.date === date);
  if (!ss.length) return go(`#/history/${ym}`);
  const blocks = ss.map((s) => {
    const rows = Object.entries(s.entries || {}).map(([exId, e]) => {
      const ex = EXERCISE_INDEX[exId];
      const name = ex ? ex.name : exId;
      const vol = entryVolume(e);
      return `<div class="detail-ex"><h4>${esc(name)}</h4><div class="vals">${esc(formatSets(ex, e))}${vol ? ` <span class="vol">· vol ${vol} kg·rep</span>` : ""}</div>${e.notas ? `<div class="notas">${esc(e.notas)}</div>` : ""}</div>`;
    }).join("") || `<p class="sub">Sesión sin datos.</p>`;
    return `<div class="day-block">
      <div class="day-block-h">${esc(s.dayName)}${s.durationSec ? ` <span class="dur">${I.clock} ${fmtDur(s.durationSec * 1000)}</span>` : ""}</div>
      ${rows}
      ${s.check && (s.check.energia || s.check.sueno) ? `<div class="check-line">${s.check.energia ? `Energía ${s.check.energia}/5` : ""}${s.check.energia && s.check.sueno ? " · " : ""}${s.check.sueno ? `Sueño ${s.check.sueno}/5` : ""}</div>` : ""}
      <div class="block-actions">
        <button class="chip" data-editses="${s.id}">${I.swap} Editar</button>
        <button class="chip danger" data-delses="${s.id}">Borrar</button>
      </div>
    </div>`;
  }).join("");
  shell(`
    <div class="screen">
      ${topbar(fmtDateLong(date), "Detalle del día")}
      <button class="linkbtn" data-go="#/history/${ym}">← Volver al historial</button>
      ${blocks}
    </div>`, "history");
  bindCommon();
  document.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => go(b.dataset.go));
  document.querySelectorAll("[data-editses]").forEach((b) => b.onclick = () => editSession(b.dataset.editses));
  document.querySelectorAll("[data-delses]").forEach((b) => b.onclick = () => deleteSession(b.dataset.delses, date));
}

// editar: carga la sesión en el asistente y al guardar actualiza el documento
function editSession(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  const day = DAYS.find((d) => d.id === s.dayId);
  if (!day) return toast("Esa sesión usa una rutina antigua", true);
  draft = {
    dayId: s.dayId, date: s.date, idx: 0, pendingCue: false, startedAt: Date.now(),
    editingId: s.id, baseDuration: s.durationSec || null,
    check: s.check ? { ...s.check } : { energia: null, sueno: null },
    entries: JSON.parse(JSON.stringify(s.entries || {})),
  };
  go("#/session/" + s.dayId);
}

async function deleteSession(id, date) {
  if (!confirm("¿Borrar esta sesión? No se puede deshacer.")) return;
  try {
    await deleteDoc(doc(db, "users", state.user.uid, "sessions", id));
    state.sessions = state.sessions.filter((s) => s.id !== id);
    toast("Sesión borrada");
    const stillThatDay = state.sessions.some((s) => s.date === date);
    go(stillThatDay ? "#/day/" + date : "#/history/" + date.slice(0, 7));
  } catch (e) { console.error(e); toast("No se pudo borrar", true); }
}

function renderLogDetail(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return go("#/history");
  const rows = Object.entries(s.entries || {}).map(([exId, e]) => {
    const ex = EXERCISE_INDEX[exId];
    const name = ex ? ex.name : exId;
    const vol = entryVolume(e);
    return `<div class="detail-ex">
      <h4>${esc(name)}</h4>
      <div class="vals">${esc(formatSets(ex, e))}${vol ? ` <span class="vol">· vol ${vol} kg·rep</span>` : ""}</div>
      ${e.notas ? `<div class="notas">${esc(e.notas)}</div>` : ""}
    </div>`;
  }).join("") || `<p class="sub">Sesión sin datos.</p>`;

  shell(`
    <div class="screen">
      ${topbar(s.dayName, fmtDate(s.date))}
      <button class="linkbtn" data-go="#/history">← Volver al historial</button>
      ${rows}
    </div>`, "history");
  bindCommon();
  document.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => go(b.dataset.go));
}

// ---------- progreso + gráfica ----------
function seriesFor(exId) {
  const ex = EXERCISE_INDEX[exId];
  const time = ex && ex.unit === "seg";
  const pts = [];
  [...state.sessions].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((s) => {
    const e = s.entries && s.entries[exId];
    if (!e) return;
    const reps = entryReps(e);
    const w = workWeight(e);
    if (!reps.length && w == null) return;
    const value = time ? (reps.length ? Math.max(...reps) : null) : (w != null ? w : (reps.length ? Math.max(...reps) : null));
    if (value == null) return;
    pts.push({ date: s.date, value, volume: entryVolume(e), totReps: reps.reduce((a, b) => a + b, 0) });
  });
  return { pts, time };
}

function lineChart({ pts, time }, ex) {
  if (pts.length < 1) return `<div class="empty"><p>Sin registros todavía para este ejercicio.</p></div>`;
  const W = 320, H = 160, padX = 16, padY = 20;
  const vals = pts.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const x = (i) => padX + (pts.length === 1 ? (W - 2 * padX) / 2 : (i / (pts.length - 1)) * (W - 2 * padX));
  const y = (v) => H - padY - ((v - min) / (max - min)) * (H - 2 * padY);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5" fill="var(--accent)"/>`).join("");
  const labels = pts.map((p, i) =>
    `<text x="${x(i).toFixed(1)}" y="${(y(p.value) - 8).toFixed(1)}" font-size="9" fill="var(--ink)" text-anchor="middle" font-family="Space Mono, monospace">${p.value}</text>`).join("");
  const grid = [0, 0.5, 1].map((t) => {
    const yy = padY + t * (H - 2 * padY);
    return `<line x1="${padX}" y1="${yy}" x2="${W - padX}" y2="${yy}" stroke="var(--line)" stroke-width="1"/>`;
  }).join("");
  return `
    <div class="chartcard">
      <div class="chart-legend"><span><i style="background:var(--accent)"></i>${time ? "Aguante por serie (s)" : "Peso de trabajo (kg)"}</span></div>
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        ${grid}
        <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}${labels}
      </svg>
    </div>`;
}

function progSeg(active, exId) {
  const exHref = "#/progress/ex/" + (exId || "");
  const item = (key, href, label) => `<a href="${href}" class="seg ${active === key ? "on" : ""}">${label}</a>`;
  return `<div class="segbar">
    ${item("ex", exHref, "Ejercicio")}
    ${item("vol", "#/progress/vol", "Volumen")}
    ${item("pr", "#/progress/pr", "Récords")}
    ${item("med", "#/progress/med", "Medidas")}
    ${item("fotos", "#/progress/fotos", "Fotos")}
    ${item("recap", "#/progress/recap", "Resumen")}
  </div>`;
}

function renderProgress(sub, arg) {
  const tabs = ["ex", "vol", "pr", "med", "fotos", "recap"];
  let tab = "ex", exId = null;
  if (tabs.includes(sub)) { tab = sub; if (sub === "ex") exId = arg; }
  else if (sub) { tab = "ex"; exId = sub; } // compat con #/progress/<id>

  if (tab === "vol") return renderProgVolume();
  if (tab === "pr") return renderProgRecords();
  if (tab === "med") return renderProgMeasures();
  if (tab === "fotos") return renderProgPhotos();
  if (tab === "recap") return renderProgRecap();
  return renderProgExercise(exId);
}

function renderProgExercise(exId) {
  const current = exId && EXERCISE_INDEX[exId] ? exId : DAYS[0].exercises[0].id;
  const ex = EXERCISE_INDEX[current];
  const data = seriesFor(current);
  const withData = data.pts;
  const best = bestFor(current);
  const e1o = bestE1RM(current);
  const e1 = e1o.value;
  const e1show = data.time ? null : (e1 ? Math.round(e1 * 10) / 10 : (ex.rmInicial ? Math.round(ex.rmInicial * 10) / 10 : null));

  const options = DAYS.map((d) =>
    `<optgroup label="${esc(d.name)}">` +
    d.exercises.map((e) => `<option value="${e.id}" ${e.id === current ? "selected" : ""}>${esc(e.name)}</option>`).join("") +
    `</optgroup>`).join("");

  const when = (iso) => iso ? `<div class="rec-when">${fmtDate(iso)}</div>` : "";
  const bestVal = data.time ? best.repsMax : best.weight;
  const bestDate = data.time ? best.dR : best.dW;
  const stat3 = data.time
    ? `<div class="stat"><div class="k">Mejor aguante</div><div class="v">${best.repsMax || "—"}<small> s</small></div>${best.repsMax ? when(best.dR) : ""}</div>`
    : `<div class="stat"><div class="k">Mejor volumen</div><div class="v">${best.volume || "—"}<small> kg·rep</small></div>${best.volume ? when(best.dV) : ""}</div>`;
  const stat4 = data.time ? "" :
    `<div class="stat"><div class="k">1RM est.</div><div class="v">${e1show != null ? e1show : "—"}<small> kg</small></div>${e1 && e1o.date ? when(e1o.date) : ""}</div>`;

  shell(`
    <div class="screen">
      ${topbar("Progreso", "Tu evolución")}
      ${progSeg("ex", current)}
      <select class="exselect" id="exsel">${options}</select>
      ${lineChart(data, ex)}
      <div class="statgrid">
        <div class="stat"><div class="k">Sesiones</div><div class="v">${withData.length}</div></div>
        <div class="stat"><div class="k">${data.time ? "Mejor aguante" : "Mejor peso"}</div><div class="v">${bestVal || "—"}<small> ${data.time ? "s" : "kg"}</small></div>${bestVal ? when(bestDate) : ""}</div>
        ${stat3}
        ${stat4}
      </div>
      ${e1show != null && !data.time ? `<p class="e1note">1RM estimado con la fórmula de Epley a partir de tus series${e1 ? "" : " (estimación inicial del plan)"}.</p>` : ""}
      <div class="divider"><span class="label">Objetivo</span><span class="rule"></span></div>
      <p class="sub">${esc(ex.scheme)} · RIR ${esc(ex.rir)}. ${esc(suggestion(ex).text)}</p>
    </div>`, "progress");
  bindCommon();
  $("#exsel").onchange = (e) => go("#/progress/ex/" + e.target.value);
}

function renderProgVolume() {
  const ref = state.volWeek || todayISO();
  const { start, end, groups } = weeklyVolume(ref);
  const totalSets = groups.reduce((a, g) => a + g.sets, 0);
  const totalTarget = groups.reduce((a, g) => a + (g.target || 0), 0);
  const thisMon = weekRange(todayISO()).start;
  const atCurrent = start >= thisMon;

  const rows = groups.map((g) => {
    const pct = g.target ? Math.min(100, Math.round(g.sets / g.target * 100)) : (g.sets ? 100 : 0);
    const state2 = g.target && g.sets >= g.target ? "hit" : (g.target && g.sets >= g.target * 0.6 ? "near" : "");
    return `
    <div class="volrow">
      <div class="vol-h"><span class="vol-name">${g.group}</span><span class="vol-sets">${fmtSets(g.sets)}${g.target ? ` / ${fmtSets(g.target)}` : ""} series</span></div>
      <div class="volbar"><div class="volbar-fill ${state2}" style="width:${pct}%"></div></div>
      <div class="vol-sub">${g.vol ? g.vol + " kg·rep" : "—"}</div>
    </div>`;
  }).join("");

  // tendencia: total de series de las últimas 8 semanas
  const weeks = [];
  for (let i = 7; i >= 0; i--) weeks.push(weekRange(addDaysISO(thisMon, -7 * i)).start);
  const totals = weeks.map((w) => weekTotalSets(w));
  const tmax = Math.max(1, ...totals);
  const trend = `<div class="trend">${totals.map((v, i) => {
    const isCur = weeks[i] === start;
    return `<div class="trend-bar ${isCur ? "now" : ""}" style="height:${Math.max(4, Math.round(v / tmax * 56))}px" title="${fmtSets(v)} series"></div>`;
  }).join("")}</div>`;

  shell(`
    <div class="screen">
      ${topbar("Progreso", "Tu evolución")}
      ${progSeg("vol")}
      <div class="wknav">
        <button class="navbtn" id="wkprev">‹</button>
        <div class="wklabel">${fmtDate(start)} – ${fmtDate(end)}</div>
        <button class="navbtn ${atCurrent ? "off" : ""}" id="wknext" ${atCurrent ? "disabled" : ""}>›</button>
      </div>
      <div class="voltot"><span><b>${fmtSets(totalSets)}</b>${totalTarget ? ` / ${fmtSets(totalTarget)}` : ""} series</span><span>objetivo del plan</span></div>
      <div class="vollist">${rows}</div>
      <div class="divider"><span class="label">Tendencia · 8 semanas</span><span class="rule"></span></div>
      ${trend}
      <p class="save-hint" style="margin-top:14px">Barra llena = objetivo semanal del plan por grupo (principal 1 serie, secundario ½). ~10-20 series por grupo suele ir bien para hipertrofia.</p>
    </div>`, "progress");
  bindCommon();
  $("#wkprev").onclick = () => { state.volWeek = addDaysISO(start, -7); render(); };
  const nx = $("#wknext"); if (nx) nx.onclick = () => { if (!atCurrent) { state.volWeek = addDaysISO(start, 7); render(); } };
}

function renderProgRecords() {
  const blocks = DAYS.map((d) => {
    const rows = d.exercises.map((ex) => {
      const b = bestFor(ex.id);
      const has = b.weight || b.volume || b.repsMax;
      const val = ex.unit === "seg"
        ? (b.repsMax ? `${b.repsMax} s` : "—")
        : (b.weight ? `${b.weight} kg` : "—");
      const sub = ex.unit === "seg" ? "" : (b.volume ? `${b.volume} kg·rep` : "");
      const recDate = ex.unit === "seg" ? b.dR : b.dW;
      return `<div class="rec-row ${has ? "" : "muted"}">
        <div class="rec-name">${esc(ex.name)}${recDate ? `<span class="rec-date">${fmtDate(recDate)}</span>` : ""}</div>
        <div class="rec-val">${val}${sub ? `<small>${sub}</small>` : ""}</div>
      </div>`;
    }).join("");
    return `<div class="rec-block"><div class="rec-day">${esc(d.name)}</div>${rows}</div>`;
  }).join("");

  shell(`
    <div class="screen">
      ${topbar("Progreso", "Tu evolución")}
      ${progSeg("pr")}
      <div class="reclist">${blocks}</div>
      <p class="save-hint" style="margin-top:14px">Tu mejor marca por ejercicio: peso máximo (o aguante en isométricos) y mejor volumen en una sesión.</p>
    </div>`, "progress");
  bindCommon();
}

function renderProgPhotos() {
  if (!state.progLoaded) loadProgress().then(() => { if (parseHash().name === "progress") render(); });
  const photos = state.photos;

  // modo comparar (antes/después)
  if (state.cmpMode && photos.length >= 2) {
    const aId = state.cmpA || photos[photos.length - 1].id;  // más antigua
    const bId = state.cmpB || photos[0].id;                  // más reciente
    const A = photos.find((p) => p.id === aId) || photos[photos.length - 1];
    const B = photos.find((p) => p.id === bId) || photos[0];
    const opts = (sel) => photos.map((p) => `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${fmtDate(p.date)}</option>`).join("");
    shell(`
      <div class="screen">
        ${topbar("Progreso", "Tu evolución")}
        ${progSeg("fotos")}
        <button class="linkbtn" id="cmpback">← Ver galería</button>
        <div class="cmpwrap">
          <figure class="cmp-item"><img src="${A.img}" alt=""><figcaption><select id="cmpa">${opts(A.id)}</select></figcaption></figure>
          <figure class="cmp-item"><img src="${B.img}" alt=""><figcaption><select id="cmpb">${opts(B.id)}</select></figcaption></figure>
        </div>
        <p class="save-hint" style="margin-top:14px">Elige dos fechas para comparar tu evolución lado a lado.</p>
      </div>`, "progress");
    bindCommon();
    $("#cmpback").onclick = () => { state.cmpMode = false; render(); };
    $("#cmpa").onchange = (e) => { state.cmpA = e.target.value; render(); };
    $("#cmpb").onchange = (e) => { state.cmpB = e.target.value; render(); };
    return;
  }

  const grid = photos.length ? photos.map((p) => `
    <button class="photo-thumb" data-view="${p.id}">
      <img src="${p.img}" alt="${esc(p.date)}" loading="lazy">
      <span class="pt-date">${fmtDate(p.date)}</span>
    </button>`).join("") : `<div class="empty"><p>Aún no hay fotos. Añade la primera para ver tu evolución.</p></div>`;

  shell(`
    <div class="screen">
      ${topbar("Progreso", "Tu evolución")}
      ${progSeg("fotos")}
      <div class="photo-actions">
        <label class="addphoto" id="addlbl">${I.image}<span>Añadir foto</span><input type="file" accept="image/*" id="photoin" hidden></label>
        ${photos.length >= 2 ? `<button class="btn btn-ghost" id="cmpbtn">Comparar</button>` : ""}
        ${photos.length ? `<button class="btn btn-ghost" id="dlall">Descargar todas</button>` : ""}
      </div>
      <div class="photogrid">${state.progLoaded ? grid : `<div class="empty"><p>Cargando…</p></div>`}</div>
      <p class="save-hint" style="margin-top:14px">Toca una foto para verla grande. Se guardan en tu cuenta (comprimidas); descarga el zip de vez en cuando como copia de seguridad.</p>
    </div>`, "progress");
  bindCommon();
  const cmp = $("#cmpbtn"); if (cmp) cmp.onclick = () => { state.cmpMode = true; render(); };
  const dla = $("#dlall"); if (dla) dla.onclick = downloadAllPhotos;
  document.querySelectorAll("[data-view]").forEach((b) => b.onclick = () => openPhoto(b.dataset.view));
  const input = $("#photoin");
  if (input) input.onchange = async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const lbl = $("#addlbl"); if (lbl) lbl.classList.add("busy");
    try { await addPhoto(file); toast("Foto guardada"); }
    catch (err) { console.error(err); toast("No se pudo guardar la foto", true); }
    render();
  };
}

// ---------- Medidas corporales ----------
function measLineChart(series, unit) {
  if (!series.length) return `<div class="empty"><p>Aún no hay datos de esta medida.</p></div>`;
  const W = 320, H = 178, padX = 16, padTop = 22, padBottom = 30;
  const vals = series.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const x = (i) => padX + (series.length === 1 ? (W - 2 * padX) / 2 : (i / (series.length - 1)) * (W - 2 * padX));
  const y = (v) => H - padBottom - ((v - min) / (max - min)) * (H - padTop - padBottom);
  const path = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const dots = series.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5" fill="var(--accent)"/>`).join("");
  const labels = series.map((p, i) =>
    `<text x="${x(i).toFixed(1)}" y="${(y(p.value) - 8).toFixed(1)}" font-size="9" fill="var(--ink)" text-anchor="middle" font-family="Space Mono, monospace">${p.value}</text>`).join("");
  const grid = [0, 0.5, 1].map((t) => { const yy = padTop + t * (H - padTop - padBottom); return `<line x1="${padX}" y1="${yy}" x2="${W - padX}" y2="${yy}" stroke="var(--line)" stroke-width="1"/>`; }).join("");
  // eje X: una etiqueta por mes (primer punto de cada mes), con año solo cuando cambia
  let lastKey = "", lastYear = null;
  const baseY = H - padBottom;
  const xaxis = series.map((p, i) => {
    const [yy, mm] = p.date.split("-").map(Number);
    const key = yy + "-" + mm;
    if (key === lastKey) return "";
    lastKey = key;
    const txt = MES[mm - 1] + (lastYear !== null && yy !== lastYear ? " " + String(yy).slice(2) : "");
    lastYear = yy;
    const anchor = i === 0 ? "start" : (i === series.length - 1 ? "end" : "middle");
    const tick = `<line x1="${x(i).toFixed(1)}" y1="${padTop}" x2="${x(i).toFixed(1)}" y2="${baseY}" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 3"/>`;
    return tick + `<text x="${x(i).toFixed(1)}" y="${H - 10}" font-size="9" fill="var(--muted)" text-anchor="${anchor}" font-family="Space Mono, monospace">${txt}</text>`;
  }).join("");
  return `<div class="chartcard"><div class="chart-legend"><span><i style="background:var(--accent)"></i>${unit}</span></div>
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${grid}${xaxis}
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}</svg></div>`;
}

function renderProgMeasures() {
  if (!state.measLoaded) loadMeasures().then(() => { if (parseHash().name === "progress") render(); });
  const metric = state.measMetric || "peso";
  const fld = MEASURE_FIELDS.find((f) => f.key === metric) || MEASURE_FIELDS[0];
  const series = measureSeries(metric);
  const last = series.length ? series[series.length - 1] : null;
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const delta = last && prev ? Math.round((last.value - prev.value) * 10) / 10 : null;
  const deltaTxt = delta == null ? "" : (delta === 0 ? "= igual" : (delta > 0 ? `▲ +${delta}` : `▼ ${delta}`) + ` ${fld.unit}`);

  const metricChips = MEASURE_FIELDS.map((f) =>
    `<button class="mchip ${f.key === metric ? "on" : ""}" data-metric="${f.key}">${f.label}</button>`).join("");
  const inputs = MEASURE_FIELDS.map((f) =>
    `<label class="minput"><span>${f.label} <small>${f.unit}</small></span>
      <input type="number" inputmode="decimal" step="${f.step}" data-mfield="${f.key}" placeholder="—"></label>`).join("");

  const history = state.measLoaded ? (state.measures.length ? state.measures.map((m) => {
    const parts = MEASURE_FIELDS.filter((f) => m.values && m.values[f.key] != null)
      .map((f) => `${f.label} ${m.values[f.key]}${f.unit}`).join(" · ");
    return `<div class="measrow"><div><div class="meas-d">${fmtDate(m.date)}</div><div class="meas-v">${esc(parts || "—")}</div></div>
      <button class="chip danger" data-delmeas="${m.id}">Borrar</button></div>`;
  }).join("") : `<div class="empty"><p>Aún no has anotado medidas.</p></div>`) : `<div class="empty"><p>Cargando…</p></div>`;

  shell(`
    <div class="screen">
      ${topbar("Progreso", "Tu evolución")}
      ${progSeg("med")}
      <div class="mchips">${metricChips}</div>
      ${measLineChart(series, fld.unit)}
      <div class="statgrid">
        <div class="stat"><div class="k">${fld.label} actual</div><div class="v">${last ? last.value : "—"}<small> ${fld.unit}</small></div></div>
        <div class="stat"><div class="k">Cambio</div><div class="v" style="font-size:20px">${deltaTxt || "—"}</div></div>
        <div class="stat"><div class="k">Registros</div><div class="v">${series.length}</div></div>
      </div>
      <div class="divider"><span class="label">Nueva medición</span><span class="rule"></span></div>
      <label class="date" style="margin-bottom:10px">${I.clock}<input type="date" id="mdate" value="${todayISO()}"></label>
      <div class="mgrid">${inputs}</div>
      <div class="save-row"><button class="btn btn-primary" id="savemeas">Guardar medición</button>
        <p class="save-hint">Rellena solo lo que quieras. Mide a la misma hora (mejor en ayunas) para comparar mejor.</p></div>
      <div class="divider"><span class="label">Historial</span><span class="rule"></span></div>
      <div class="measlist">${history}</div>
    </div>`, "progress");
  bindCommon();
  document.querySelectorAll("[data-metric]").forEach((b) => b.onclick = () => { state.measMetric = b.dataset.metric; render(); });
  $("#savemeas").onclick = async () => {
    const values = {};
    document.querySelectorAll("[data-mfield]").forEach((i) => { if (i.value !== "") values[i.dataset.mfield] = i.value; });
    const date = ($("#mdate") && $("#mdate").value) || todayISO();
    if (!Object.keys(values).length) return toast("Escribe al menos una medida", true);
    const btn = $("#savemeas"); btn.disabled = true; btn.textContent = "Guardando…";
    try { await addMeasure(date, values); toast("Medición guardada"); }
    catch (e) { console.error(e); toast("No se pudo guardar", true); }
    render();
  };
  document.querySelectorAll("[data-delmeas]").forEach((b) => b.onclick = async () => {
    if (!confirm("¿Borrar esta medición?")) return;
    try { await removeMeasure(b.dataset.delmeas); toast("Medición borrada"); }
    catch (e) { console.error(e); toast("No se pudo borrar", true); }
    render();
  });
}

// ---------- Resumen semanal (tarjeta compartible) ----------
function fmtDurShort(sec) { if (!sec) return "—"; const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; }

function renderProgRecap() {
  const thisMon = weekRange(todayISO()).start;
  const ref = state.recapWeek || thisMon;
  const recap = weeklyRecap(ref);
  const atCurrent = recap.start >= thisMon;

  shell(`
    <div class="screen">
      ${topbar("Progreso", "Tu evolución")}
      ${progSeg("recap")}
      <div class="wknav">
        <button class="navbtn" id="rprev">‹</button>
        <div class="wklabel">${fmtDate(recap.start)} – ${fmtDate(recap.end)}</div>
        <button class="navbtn ${atCurrent ? "off" : ""}" id="rnext" ${atCurrent ? "disabled" : ""}>›</button>
      </div>
      <canvas id="recapcanvas" class="recapcanvas" width="1080" height="1350" aria-label="Resumen semanal"></canvas>
      <div class="recap-actions">
        <button class="btn btn-primary" id="shareRecap">Compartir</button>
        <button class="btn btn-ghost" id="dlRecap">Descargar</button>
      </div>
      <p class="save-hint" style="margin-top:6px">Tu semana en una tarjeta: adherencia, récords nuevos y volumen por grupo.</p>
    </div>`, "progress");
  bindCommon();

  const canvas = $("#recapcanvas");
  const draw = () => drawRecapCard(canvas, recap);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw); else draw();
  setTimeout(draw, 200); // refuerzo por si las fuentes tardan

  $("#rprev").onclick = () => { state.recapWeek = addDaysISO(recap.start, -7); render(); };
  const nx = $("#rnext"); if (nx) nx.onclick = () => { if (!atCurrent) { state.recapWeek = addDaysISO(recap.start, 7); render(); } };
  $("#dlRecap").onclick = () => canvas.toBlob((b) => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(b);
    a.download = `otra-repe-semana-${recap.start}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, "image/png");
  $("#shareRecap").onclick = () => canvas.toBlob(async (b) => {
    const file = new File([b], `otra-repe-semana-${recap.start}.png`, { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Mi semana en Otra Repe" });
      } else { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast("Imagen descargada"); }
    } catch (e) { /* cancelado */ }
  }, "image/png");
}

function drawRecapCard(canvas, r) {
  const ctx = canvas.getContext("2d"); const W = 1080, H = 1350;
  const ESP = "#16130f", SURF = "#1f1a14", AMB = "#f5a623", CREAM = "#f3ece1", MUT = "#9d917d", LINE = "rgba(245,166,35,0.18)";
  const round = (x, y, w, h, rd) => { ctx.beginPath(); ctx.moveTo(x + rd, y); ctx.arcTo(x + w, y, x + w, y + h, rd); ctx.arcTo(x + w, y + h, x, y + h, rd); ctx.arcTo(x, y + h, x, y, rd); ctx.arcTo(x, y, x + w, y, rd); ctx.closePath(); };
  ctx.fillStyle = ESP; ctx.fillRect(0, 0, W, H);

  // marca +1
  round(64, 60, 96, 96, 22); ctx.fillStyle = AMB; ctx.fill();
  ctx.fillStyle = ESP; ctx.font = "800 56px Archivo, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("+1", 112, 110);
  ctx.textAlign = "left";
  ctx.fillStyle = CREAM; ctx.font = "800 44px Archivo, sans-serif"; ctx.fillText("Otra Repe", 180, 92);
  ctx.fillStyle = MUT; ctx.font = "400 26px 'Space Mono', monospace"; ctx.fillText("Resumen semanal", 182, 130);
  ctx.fillStyle = AMB; ctx.font = "700 26px 'Space Mono', monospace"; ctx.textAlign = "right";
  ctx.fillText(`${fmtDate(r.start)} – ${fmtDate(r.end)}`, W - 64, 110); ctx.textAlign = "left";

  // 3 stats grandes
  const sy = 196, sh = 200, gap = 24, sw = (W - 128 - 2 * gap) / 3;
  const stat = (i, big, lbl, sub) => {
    const x = 64 + i * (sw + gap);
    round(x, sy, sw, sh, 22); ctx.fillStyle = SURF; ctx.fill();
    ctx.fillStyle = AMB; ctx.font = "800 76px Archivo, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(big, x + sw / 2, sy + 86);
    ctx.fillStyle = CREAM; ctx.font = "400 24px 'Space Mono', monospace"; ctx.fillText(lbl, x + sw / 2, sy + 138);
    if (sub) { ctx.fillStyle = MUT; ctx.font = "400 20px 'Space Mono', monospace"; ctx.fillText(sub, x + sw / 2, sy + 168); }
    ctx.textAlign = "left";
  };
  stat(0, `${r.sessionCount}/${r.target}`, "sesiones", r.sessionCount >= r.target ? "¡completa!" : "esta semana");
  stat(1, String(fmtSets(r.totalSets)), "series", "efectivas");
  stat(2, fmtDurShort(r.durationTotal), "entrenando", `${r.totalVol.toLocaleString("es-ES")} kg·rep`);

  // Récords nuevos
  let y = sy + sh + 56;
  ctx.fillStyle = CREAM; ctx.font = "800 34px Archivo, sans-serif"; ctx.fillText("Récords nuevos", 64, y);
  ctx.fillStyle = AMB; ctx.font = "800 34px Archivo, sans-serif"; ctx.textAlign = "right"; ctx.fillText(String(r.prs.length), W - 64, y); ctx.textAlign = "left";
  y += 18;
  if (r.prs.length) {
    r.prs.slice(0, 4).forEach((p) => {
      y += 50; ctx.fillStyle = AMB; ctx.font = "700 30px 'Space Mono', monospace"; ctx.fillText("★", 64, y);
      ctx.fillStyle = CREAM; ctx.font = "400 30px Archivo, sans-serif";
      let name = p.name; while (ctx.measureText(name).width > W - 200 && name.length > 4) name = name.slice(0, -2);
      if (name !== p.name) name += "…";
      ctx.fillText(name, 104, y);
    });
    if (r.prs.length > 4) { y += 44; ctx.fillStyle = MUT; ctx.font = "400 24px 'Space Mono', monospace"; ctx.fillText(`+${r.prs.length - 4} más`, 104, y); }
  } else { y += 50; ctx.fillStyle = MUT; ctx.font = "400 28px Archivo, sans-serif"; ctx.fillText("Sigue empujando — la próxima caen.", 64, y); }

  // Volumen por grupo
  y += 72; ctx.fillStyle = CREAM; ctx.font = "800 34px Archivo, sans-serif"; ctx.fillText("Volumen por grupo", 64, y);
  y += 24;
  const groups = r.groups.filter((g) => g.target || g.sets).slice(0, 8);
  const maxV = Math.max(1, ...groups.map((g) => Math.max(g.sets, g.target || 0)));
  const barX = 280, barW = W - 64 - barX;
  groups.forEach((g) => {
    y += 52;
    ctx.fillStyle = CREAM; ctx.font = "400 28px Archivo, sans-serif"; ctx.fillText(g.group, 64, y);
    round(barX, y - 26, barW, 30, 15); ctx.fillStyle = SURF; ctx.fill();
    const w = Math.max(8, Math.round(barW * Math.min(1, g.sets / maxV)));
    const hit = g.target && g.sets >= g.target;
    round(barX, y - 26, w, 30, 15); ctx.fillStyle = hit ? "#5bb98c" : AMB; ctx.fill();
    ctx.fillStyle = MUT; ctx.font = "400 22px 'Space Mono', monospace"; ctx.textAlign = "right";
    ctx.fillText(`${fmtSets(g.sets)}${g.target ? "/" + fmtSets(g.target) : ""}`, W - 64, y - 4); ctx.textAlign = "left";
  });

  // footer
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(64, H - 108); ctx.lineTo(W - 64, H - 108); ctx.stroke();
  ctx.fillStyle = AMB; ctx.font = "700 30px 'Space Mono', monospace"; ctx.fillText(`Racha: ${r.streak} ${r.streak === 1 ? "semana" : "semanas"}`, 64, H - 62);
  ctx.fillStyle = MUT; ctx.font = "400 24px 'Space Mono', monospace"; ctx.textAlign = "right"; ctx.fillText("Otra Repe · +1", W - 64, H - 62); ctx.textAlign = "left";
}

function renderPrinciples() {
  const cards = PRINCIPLES.map((p) =>
    `<div class="pcard"><h3>${esc(p.title)}</h3><p>${esc(p.body)}</p></div>`).join("");
  const rem = loadReminders();
  const DOW = ["L", "M", "X", "J", "V", "S", "D"];
  const dayChips = DOW.map((d, i) =>
    `<button class="dowchip ${rem.days.includes(i) ? "on" : ""}" data-dow="${i}">${d}</button>`).join("");

  shell(`
    <div class="screen">
      ${topbar("Guía", "Principios de la rutina")}
      <div class="princ">${cards}</div>

      <div class="divider"><span class="label">Ajustes</span><span class="rule"></span></div>

      <div class="setrow">
        <div class="set-txt"><b>Auto-descanso</b><span>Abre el temporizador con el descanso del ejercicio al anotar una serie.</span></div>
        <button class="switch ${autoRestOn() ? "on" : ""}" id="swauto" role="switch" aria-checked="${autoRestOn()}"><i></i></button>
      </div>

      <div class="setrow">
        <div class="set-txt"><b>Recordatorios</b><span>Aviso los días de entreno (mientras la app esté abierta o en segundo plano reciente).</span></div>
        <button class="switch ${rem.enabled ? "on" : ""}" id="swrem" role="switch" aria-checked="${rem.enabled}"><i></i></button>
      </div>
      <div class="rem-cfg ${rem.enabled ? "" : "hidden"}" id="remcfg">
        <div class="dowrow">${dayChips}</div>
        <label class="timerow">Hora <input type="time" id="remtime" value="${rem.time}"></label>
      </div>

      <div class="setrow">
        <div class="set-txt"><b>Exportar / backup</b><span>Descarga tus entrenos para analizarlos o guardarlos.</span></div>
      </div>
      <div class="exprow">
        <button class="btn btn-ghost" id="expcsv">CSV</button>
        <button class="btn btn-ghost" id="expjson">Backup JSON</button>
        <label class="btn btn-ghost" id="impbtn">Importar<input type="file" accept="application/json,.json" id="impin" hidden></label>
      </div>

      <div class="divider"><span class="label">Zona peligrosa</span><span class="rule"></span></div>
      <div class="setrow">
        <div class="set-txt"><b>Borrar todo</b><span>Elimina de forma permanente <b>todos</b> tus entrenos, fotos y medidas. No se puede deshacer. Exporta un backup antes si quieres conservar algo.</span></div>
      </div>
      <button class="btn btn-danger" id="wipeall">Borrar todo</button>

      <p class="save-hint" style="margin-top:18px">Los vídeos abren una búsqueda en YouTube con buenas demostraciones de cada ejercicio.</p>
    </div>`, "principios");
  bindCommon();

  // auto-descanso
  $("#swauto").onclick = () => { setAutoRest(!autoRestOn()); render(); };

  // recordatorios
  $("#swrem").onclick = async () => {
    const r = loadReminders();
    if (!r.enabled) {
      if ("Notification" in window && Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { toast("Permiso de notificaciones denegado", true); return; }
      } else if (!("Notification" in window)) { toast("Tu navegador no soporta notificaciones", true); return; }
      r.enabled = true;
    } else { r.enabled = false; }
    saveReminders(r); applyReminders(); render();
  };
  document.querySelectorAll("[data-dow]").forEach((b) => b.onclick = () => {
    const r = loadReminders(); const i = +b.dataset.dow;
    r.days = r.days.includes(i) ? r.days.filter((x) => x !== i) : [...r.days, i].sort();
    saveReminders(r); applyReminders(); render();
  });
  const rt = $("#remtime"); if (rt) rt.onchange = (e) => { const r = loadReminders(); r.time = e.target.value || "18:00"; saveReminders(r); applyReminders(); };

  // exportar
  $("#expcsv").onclick = () => { if (!state.sessions.length) return toast("No hay entrenos que exportar", true); exportCSV(); };
  $("#expjson").onclick = () => { if (!state.sessions.length) return toast("No hay entrenos que exportar", true); exportJSON(); };

  // borrar todo (doble confirmación)
  const wipe = $("#wipeall");
  if (wipe) wipe.onclick = async () => {
    if (!confirm("Esto borrará DE FORMA PERMANENTE todos tus entrenos, fotos y medidas, y restablecerá tus preferencias.\n\nNo se puede deshacer. ¿Continuar?")) return;
    const typed = prompt('Última confirmación. Escribe BORRAR (en mayúsculas) para eliminarlo todo:');
    if (typed !== "BORRAR") return toast("Cancelado, no se ha borrado nada");
    wipe.disabled = true; wipe.textContent = "Borrando…";
    try { await deleteAllData(); toast("Se ha borrado todo"); go("#/days"); }
    catch (e) { console.error(e); toast("Hubo un error al borrar; reintenta", true); render(); }
  };

  // importar backup
  const imp = $("#impin");
  if (imp) imp.onchange = (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let data;
      try { data = JSON.parse(reader.result); } catch (_) { return toast("Archivo no válido", true); }
      const sess = Array.isArray(data.sessions) ? data.sessions : null;
      if (!sess) return toast("El backup no tiene sesiones", true);
      if (!confirm(`¿Importar ${sess.length} sesiones? Se añadirán a las actuales.`)) return;
      await importBackup(data);
    };
    reader.readAsText(file);
  };
}

async function importBackup(data) {
  const sess = (data.sessions || []).filter((s) => s && s.entries);
  let ok = 0;
  try {
    for (const s of sess) {
      const payload = { dayId: s.dayId, dayName: s.dayName, date: s.date, entries: s.entries,
        durationSec: s.durationSec ?? null, check: s.check ?? null, createdAt: serverTimestamp() };
      const ref = await addDoc(collection(db, "users", state.user.uid, "sessions"), payload);
      state.sessions.push({ id: ref.id, ...payload });
      ok++;
    }
    if (data.variants && typeof data.variants === "object") { state.variants = { ...state.variants, ...data.variants }; saveVariants(); }
    state.sessions.sort((a, b) => (a.date < b.date ? 1 : -1));
    toast(`Importadas ${ok} sesiones`);
    go("#/history");
  } catch (e) { console.error(e); toast(`Importadas ${ok}; fallo en el resto`, true); }
}

// ---------- borrar absolutamente todo ----------
async function deleteAllData() {
  // 1) borrar todas las subcolecciones del usuario en Firestore
  for (const sub of ["sessions", "progress", "measures"]) {
    const snap = await getDocs(collection(db, "users", state.user.uid, sub));
    for (let i = 0; i < snap.docs.length; i += 20) {
      await Promise.all(snap.docs.slice(i, i + 20).map((d) => deleteDoc(d.ref)));
    }
  }
  // 2) limpiar estado en memoria
  state.sessions = []; state.photos = []; state.measures = [];
  state.variants = {}; state.favorites = {};
  state.progLoaded = true; state.measLoaded = true;
  state.volWeek = null; state.recapWeek = null; state.cmpMode = false; state.cmpA = null; state.cmpB = null;
  // 3) limpiar preferencias locales (todo lo de la app)
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("carga")) keys.push(k); }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch (_) {}
}

// ---------- temporizador ----------
let timer = { id: null, remaining: 0, total: 0, running: false };

function openTimer(seconds) {
  timer.total = seconds; timer.remaining = seconds; timer.running = false;
  if (timer.id) { clearInterval(timer.id); timer.id = null; }
  drawTimer();
}
function fmtClock(s) { const m = Math.floor(s / 60), r = s % 60; return `${m}:${String(r).padStart(2, "0")}`; }

function drawTimer() {
  const presets = [60, 90, 120, 180];
  const back = document.createElement("div");
  back.className = "sheet-back"; back.id = "timerback";
  const R = 52, C = 2 * Math.PI * R;
  const frac = timer.total ? timer.remaining / timer.total : 0;
  back.innerHTML = `
    <div class="sheet" role="dialog" aria-label="Temporizador de descanso">
      <button class="close" id="tclose">×</button>
      <h3>Descanso</h3>
      <svg class="timer-ring" width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="9"/>
        <circle id="tring" cx="70" cy="70" r="${R}" fill="none" stroke="var(--accent)" stroke-width="9"
          stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${((1 - frac) * C).toFixed(1)}"
          transform="rotate(-90 70 70)"/>
      </svg>
      <div class="timer-readout ${timer.remaining === 0 ? "done" : timer.running ? "go" : ""}" id="treadout">${fmtClock(timer.remaining)}</div>
      <div class="presets">${presets.map((p) =>
        `<button class="preset ${p === timer.total ? "active" : ""}" data-p="${p}">${p < 60 ? p + "s" : p / 60 + "m"}</button>`).join("")}</div>
      <div class="timer-controls">
        <button class="btn btn-ghost" id="treset">Reiniciar</button>
        <button class="btn btn-primary" id="ttoggle">${timer.running ? "Pausar" : "Empezar"}</button>
      </div>
    </div>`;
  // limpiar previo
  const prev = $("#timerback"); if (prev) prev.remove();
  document.body.appendChild(back);

  back.onclick = (e) => { if (e.target === back) closeTimer(); };
  $("#tclose").onclick = closeTimer;
  $("#treset").onclick = () => { timer.remaining = timer.total; timer.running = false; stopTick(); drawTimer(); };
  $("#ttoggle").onclick = () => { timer.running ? pauseTick() : startTick(); };
  back.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => openTimer(+b.dataset.p));
}
function startTick() {
  if (timer.remaining <= 0) timer.remaining = timer.total;
  timer.running = true; drawTimer();
  const C = 2 * Math.PI * 52;
  timer.id = setInterval(() => {
    timer.remaining = Math.max(0, timer.remaining - 1);
    const ro = $("#treadout"), ring = $("#tring");
    if (ro) { ro.textContent = fmtClock(timer.remaining); ro.className = "timer-readout " + (timer.remaining === 0 ? "done" : "go"); }
    if (ring) ring.setAttribute("stroke-dashoffset", ((1 - (timer.total ? timer.remaining / timer.total : 0)) * C).toFixed(1));
    if (timer.remaining === 0) { stopTick(); beep(); navigator.vibrate && navigator.vibrate([200, 80, 200]); }
  }, 1000);
}
function pauseTick() { timer.running = false; stopTick(); drawTimer(); }
function stopTick() { if (timer.id) { clearInterval(timer.id); timer.id = null; } timer.running = timer.running && false; }
function closeTimer() { stopTick(); const b = $("#timerback"); if (b) b.remove(); }
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; o.type = "sine";
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.start(); o.stop(ctx.currentTime + 0.5);
  } catch (_) {}
}

// ---------- comunes ----------
function bindCommon() {
  const lo = $("#logout"); if (lo) lo.onclick = () => signOut(auth);
}

// ---------- auth ----------
async function doSignIn() {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    // en móvil el popup puede fallar: caemos a redirección
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment",
         "auth/cancelled-popup-request", "auth/popup-closed-by-user"].includes(e.code)) {
      try { await signInWithRedirect(auth, provider); } catch (_) { toast("No se pudo iniciar sesión", true); }
    } else {
      console.error(e); toast("Error al entrar: " + (e.code || e.message), true);
    }
  }
}

async function loadSessions() {
  state.loaded = false;
  try {
    const q = query(collection(db, "users", state.user.uid, "sessions"), orderBy("date", "desc"));
    const snap = await getDocs(q);
    state.sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error(e); toast("No se pudieron cargar los entrenos", true);
    state.sessions = [];
  }
  state.loaded = true;
}

// ---------- arranque ----------
async function boot() {
  if (!CONFIGURED) { render(); return; }
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  try { await getRedirectResult(auth); } catch (_) {}

  onAuthStateChanged(auth, async (user) => {
    state.user = user || null;
    if (user) {
      await loadSessions();
      loadProgress();      // en segundo plano
      applyReminders();
      if (!location.hash) go("#/days"); else render();
    } else {
      state.loaded = false; state.sessions = []; state.photos = []; state.progLoaded = false;
      state.measures = []; state.measLoaded = false;
      if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; }
      render();
    }
  });
}

boot();

// service worker (PWA)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
