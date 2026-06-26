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
  volWeek: null,     // semana visible en "Volumen"
};

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
const TOKEN_GROUP = {
  chest: "Pecho",
  lats: "Espalda", "middle back": "Espalda", "lower back": "Espalda",
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
  let best = 0;
  state.sessions.forEach((s) => {
    const e = s.entries && s.entries[exId]; if (!e) return;
    const w = workWeight(e); if (w == null) return;
    entryReps(e).forEach((r) => { const v = epley(w, r); if (v > best) best = v; });
  });
  return best;
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
  download(`carga-${todayISO()}.csv`, "\ufeff" + csv, "text/csv");
}
function exportJSON() {
  const data = { app: "Carga", exportedAt: new Date().toISOString(),
    variants: state.variants, sessions: state.sessions };
  download(`carga-backup-${todayISO()}.json`, JSON.stringify(data, null, 2), "application/json");
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
  notify("Toca entrenar 💪", "Tienes sesión hoy. Abre Carga y dale.");
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
        <div class="login-kicker">Torso · Pierna · 4 días</div>
        <h1 class="login-title">Levanta.<br>Anota.<br><em>Progresa.</em></h1>
        <p class="login-lead">Tu rutina de hipertrofia y todo tu seguimiento, en el bolsillo. Doble progresión calculada por ti.</p>
        <div class="login-meta">
          <span><b>24</b> ejercicios · <b>4</b> sesiones</span>
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
    return `
      <div class="pp-row">
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

  const muscles = `<div class="muscles">
      <span class="mtag main">${esc(ex.mainMuscle)}</span>
      ${ex.secMuscles.map((m) => `<span class="mtag">${esc(m)}</span>`).join("")}
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
    ${item("fotos", "#/progress/fotos", "Fotos")}
  </div>`;
}

function renderProgress(sub, arg) {
  const tabs = ["ex", "vol", "pr", "fotos"];
  let tab = "ex", exId = null;
  if (tabs.includes(sub)) { tab = sub; if (sub === "ex") exId = arg; }
  else if (sub) { tab = "ex"; exId = sub; } // compat con #/progress/<id>

  if (tab === "vol") return renderProgVolume();
  if (tab === "pr") return renderProgRecords();
  if (tab === "fotos") return renderProgPhotos();
  return renderProgExercise(exId);
}

function renderProgExercise(exId) {
  const current = exId && EXERCISE_INDEX[exId] ? exId : DAYS[0].exercises[0].id;
  const ex = EXERCISE_INDEX[current];
  const data = seriesFor(current);
  const withData = data.pts;
  const best = bestFor(current);
  const e1 = bestE1RM(current);
  const e1show = data.time ? null : (e1 ? Math.round(e1 * 10) / 10 : (ex.rmInicial ? Math.round(ex.rmInicial * 10) / 10 : null));

  const options = DAYS.map((d) =>
    `<optgroup label="${esc(d.name)}">` +
    d.exercises.map((e) => `<option value="${e.id}" ${e.id === current ? "selected" : ""}>${esc(e.name)}</option>`).join("") +
    `</optgroup>`).join("");

  const stat3 = data.time
    ? `<div class="stat"><div class="k">Mejor aguante</div><div class="v">${best.repsMax || "—"}<small> s</small></div></div>`
    : `<div class="stat"><div class="k">Mejor volumen</div><div class="v">${best.volume || "—"}<small> kg·rep</small></div></div>`;
  const stat4 = data.time ? "" :
    `<div class="stat"><div class="k">1RM est.</div><div class="v">${e1show != null ? e1show : "—"}<small> kg</small></div></div>`;

  shell(`
    <div class="screen">
      ${topbar("Progreso", "Tu evolución")}
      ${progSeg("ex", current)}
      <select class="exselect" id="exsel">${options}</select>
      ${lineChart(data, ex)}
      <div class="statgrid">
        <div class="stat"><div class="k">Sesiones</div><div class="v">${withData.length}</div></div>
        <div class="stat"><div class="k">${data.time ? "Mejor aguante" : "Mejor peso"}</div><div class="v">${(data.time ? best.repsMax : best.weight) || "—"}<small> ${data.time ? "s" : "kg"}</small></div></div>
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
      return `<div class="rec-row ${has ? "" : "muted"}">
        <div class="rec-name">${esc(ex.name)}</div>
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
    <figure class="photo-item">
      <img src="${p.img}" alt="${esc(p.date)}">
      <figcaption>${fmtDate(p.date)}</figcaption>
      <button class="photo-del" data-del="${p.id}" aria-label="Borrar">×</button>
    </figure>`).join("") : `<div class="empty"><p>Aún no hay fotos. Añade la primera para ver tu evolución.</p></div>`;

  shell(`
    <div class="screen">
      ${topbar("Progreso", "Tu evolución")}
      ${progSeg("fotos")}
      <div class="photo-actions">
        <label class="addphoto" id="addlbl">${I.image}<span>Añadir foto</span><input type="file" accept="image/*" id="photoin" hidden></label>
        ${photos.length >= 2 ? `<button class="btn btn-ghost" id="cmpbtn">Comparar</button>` : ""}
      </div>
      <div class="photogrid">${state.progLoaded ? grid : `<div class="empty"><p>Cargando…</p></div>`}</div>
      <p class="save-hint" style="margin-top:14px">Las fotos se guardan en tu cuenta (comprimidas). Una cada 2-4 semanas con la misma luz y pose ayuda a ver cambios.</p>
    </div>`, "progress");
  bindCommon();
  const cmp = $("#cmpbtn"); if (cmp) cmp.onclick = () => { state.cmpMode = true; render(); };
  const input = $("#photoin");
  if (input) input.onchange = async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const lbl = $("#addlbl"); if (lbl) lbl.classList.add("busy");
    try { await addPhoto(file); toast("Foto guardada"); }
    catch (err) { console.error(err); toast("No se pudo guardar la foto", true); }
    render();
  };
  document.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    if (!confirm("¿Borrar esta foto?")) return;
    try { await removePhoto(b.dataset.del); toast("Foto borrada"); }
    catch (err) { console.error(err); toast("No se pudo borrar", true); }
    render();
  });
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
