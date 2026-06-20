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
  getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import { DAYS, PRINCIPLES, EXERCISE_INDEX, videoUrl, DUMBBELL_CAP_KG } from "./routine.js";

const root = document.getElementById("app");
const CONFIGURED = !String(firebaseConfig.apiKey || "").startsWith("PEGA_TU");

// ---------- estado ----------
const state = {
  user: null,
  sessions: [],      // [{id, dayId, dayName, date, entries:{exId:{peso,reps,notas}}}]
  loaded: false,
};

let auth = null, db = null;

// ---------- utilidades ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const todayISO = () => {
  const d = new Date(); const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
const MES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const fmtDate = (iso) => { const [y,m,dd] = iso.split("-"); return `${+dd} ${MES[+m-1]}`; };
const num = (v) => (v === "" || v == null || isNaN(+v)) ? null : +v;

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
  google: '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.45 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 4.75 12 4.75z"/></svg>',
};

// ---------- progresión (doble progresión) ----------
function lastEntryFor(exId) {
  for (const s of state.sessions) {           // sessions vienen ordenadas desc por fecha
    const e = s.entries && s.entries[exId];
    if (e && (num(e.peso) != null || num(e.reps) != null)) return { entry: e, date: s.date };
  }
  return null;
}

function suggestion(ex) {
  const last = lastEntryFor(ex.id);
  if (!last) return { kind: "new", text: "Primer registro. Empieza en el extremo bajo del rango con buena técnica." };
  const reps = num(last.entry.reps);
  const peso = num(last.entry.peso);
  if (reps == null) return { kind: "hold", text: `Última vez con ${peso ?? "?"} kg. Anota tus reps para ver la progresión.` };

  if (ex.unit === "seg") {
    if (reps >= ex.repHigh) return { kind: "up", text: `Aguantaste ${reps} s. Sube a ${ex.repHigh + 10} s o añade carga.` };
    return { kind: "hold", text: `Última vez ${reps} s. Suma +5 s hasta llegar a ${ex.repHigh} s.` };
  }
  if (reps >= ex.repHigh) {
    if (peso != null && peso >= DUMBBELL_CAP_KG) {
      return { kind: "cap", text: `${reps} reps con ${peso} kg (tu tope). Progresa con más reps, excéntrica de 3-4 s o versión a una pierna/un brazo.` };
    }
    const next = peso != null ? peso + (peso < 5 ? 1 : 2) : null;
    return { kind: "up", text: next != null
      ? `Rango completo. Sube a ${next} kg y vuelve a ${ex.repLow} reps.`
      : `Rango completo a ${reps} reps. Sube algo de peso y vuelve a ${ex.repLow} reps.` };
  }
  return { kind: "hold", text: `Última vez ${reps} reps${peso != null ? ` · ${peso} kg` : ""}. Mantén el peso y busca +1 rep (objetivo ${ex.repHigh}).` };
}

// ---------- router ----------
function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const parts = h.split("/").filter(Boolean);
  return { name: parts[0] || "days", a: parts[1] || null };
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
    case "history": return renderHistory();
    case "log": return renderLogDetail(r.a);
    case "progress": return renderProgress(r.a);
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
  const cards = DAYS.map((d, i) => {
    const last = dayLastLabel(d.id);
    return `
      <button class="daycard" data-group="${d.group}" data-go="#/session/${d.id}">
        <span class="didx">${i + 1}</span>
        <span class="grp">${d.group === "torso" ? "Torso" : "Pierna"}</span>
        <div class="dname">${esc(d.name)}</div>
        <div class="dmeta">${d.exercises.length} ejercicios</div>
        <div class="last ${last ? "" : "none"}">${last ? "● " + last : "○ sin registros"}</div>
      </button>`;
  }).join("");
  shell(`
    <div class="screen">
      ${topbar("Elige tu día", "Hoy entrenas")}
      <div class="daylist">${cards}</div>
      <div class="divider"><span class="label">Recuerda</span><span class="rule"></span></div>
      <p class="sub">Cada grupo muscular, 2 veces por semana. Calienta 5 min antes de empezar.</p>
    </div>`, "days");
  bindCommon();
  document.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => go(b.dataset.go));
}

function renderSession(dayId) {
  const day = DAYS.find((d) => d.id === dayId);
  if (!day) return go("#/days");

  const exHtml = day.exercises.map((ex) => {
    const sug = suggestion(ex);
    const last = lastEntryFor(ex.id);
    const prefPeso = last && num(last.entry.peso) != null ? last.entry.peso : "";
    const unitLabel = ex.unit === "seg" ? "seg" : "reps";
    const range = `${ex.repLow}-${ex.repHigh}`;
    const lastReps = last ? num(last.entry.reps) : null;
    const pct = lastReps != null
      ? Math.max(0, Math.min(1, (lastReps - ex.repLow) / Math.max(1, ex.repHigh - ex.repLow)))
      : 0;
    const full = lastReps != null && lastReps >= ex.repHigh;

    return `
      <div class="exercise" data-ex="${ex.id}">
        <div class="ex-top">
          <div class="ex-name">${esc(ex.name)}</div>
          <div class="ex-scheme">${esc(ex.scheme)}<span class="rir">RIR ${esc(ex.rir)}</span></div>
        </div>

        <div class="ex-tools">
          <a class="chip" href="${videoUrl(ex.name)}" target="_blank" rel="noopener">${I.play} Vídeo</a>
          <button class="chip" data-ejec="${ex.id}">Cómo se hace</button>
          ${ex.unit === "seg" ? `<button class="chip" data-timer="${ex.repHigh}">${I.clock} ${ex.repHigh} s</button>` : ""}
        </div>

        <div class="suggest ${sug.kind === "up" ? "up" : sug.kind === "cap" ? "cap" : ""}">
          <span class="ico">${sug.kind === "up" ? "↑" : sug.kind === "cap" ? "10kg" : sug.kind === "new" ? "•" : "→"}</span>
          <span>${esc(sug.text)}</span>
        </div>

        <div class="track-wrap">
          <div class="track-head">
            <span>${ex.repLow}</span>
            <span class="now">${lastReps != null ? lastReps + " " + unitLabel : "—"}</span>
            <span>${ex.repHigh}</span>
          </div>
          <div class="track ${full ? "full" : ""}">
            <div class="fill" style="width:${(pct * 100).toFixed(0)}%"></div>
            <div class="mark" style="left:${(pct * 100).toFixed(0)}%"></div>
          </div>
        </div>

        <div class="ejec collapse" data-ejecbox="${ex.id}">${esc(ex.ejecucion)}</div>

        <div class="ex-form">
          <div class="field">
            <label>${ex.unit === "seg" ? "Carga / nivel" : "Peso (kg)"}</label>
            <div class="unit"><input type="number" inputmode="decimal" step="0.5" data-field="peso" value="${esc(prefPeso)}" placeholder="${ex.unit === "seg" ? "opcional" : "—"}"><span class="suf">${ex.unit === "seg" ? "" : "kg"}</span></div>
          </div>
          <div class="field">
            <label>${ex.unit === "seg" ? "Segundos" : "Reps (rango " + range + ")"}</label>
            <div class="unit"><input type="number" inputmode="numeric" data-field="reps" placeholder="${range}"><span class="suf">${unitLabel}</span></div>
          </div>
          <div class="field full">
            <label>Notas</label>
            <textarea data-field="notas" placeholder="Sensaciones, técnica, RIR real…"></textarea>
          </div>
        </div>
      </div>`;
  }).join("");

  shell(`
    <div class="screen">
      ${topbar(day.name, "Sesión · " + (day.group === "torso" ? "Torso" : "Pierna"))}
      <div class="shead">
        <label class="date">${I.clock}<input type="date" id="sdate" value="${todayISO()}"></label>
      </div>
      <div class="exlist">${exHtml}</div>
      <div class="save-row">
        <button class="btn btn-primary" id="save">Guardar sesión</button>
        <p class="save-hint">Se guarda lo que rellenes; lo vacío se ignora.</p>
      </div>
    </div>
    <button class="fab" id="opentimer" aria-label="Temporizador">${I.clock}</button>`, "days");

  bindCommon();
  // colapsables de ejecución
  document.querySelectorAll("[data-ejec]").forEach((b) => b.onclick = () => {
    $(`[data-ejecbox="${b.dataset.ejec}"]`).classList.toggle("open");
  });
  // temporizador desde un isométrico
  document.querySelectorAll("[data-timer]").forEach((b) => b.onclick = () => openTimer(+b.dataset.timer));
  $("#opentimer").onclick = () => openTimer(90);
  $("#save").onclick = () => saveSession(day);
}

async function saveSession(day) {
  const btn = $("#save");
  const date = $("#sdate").value || todayISO();
  const entries = {};
  document.querySelectorAll(".exercise").forEach((card) => {
    const id = card.dataset.ex;
    const peso = $('[data-field="peso"]', card).value.trim();
    const reps = $('[data-field="reps"]', card).value.trim();
    const notas = $('[data-field="notas"]', card).value.trim();
    if (peso !== "" || reps !== "" || notas !== "") {
      entries[id] = {
        peso: peso === "" ? null : Number(peso),
        reps: reps === "" ? null : Number(reps),
        notas,
      };
    }
  });
  if (Object.keys(entries).length === 0) { toast("Rellena al menos un ejercicio", true); return; }

  btn.disabled = true; btn.textContent = "Guardando…";
  try {
    const ref = await addDoc(collection(db, "users", state.user.uid, "sessions"), {
      dayId: day.id, dayName: day.name, date, entries, createdAt: serverTimestamp(),
    });
    state.sessions.unshift({ id: ref.id, dayId: day.id, dayName: day.name, date, entries });
    state.sessions.sort((a, b) => (a.date < b.date ? 1 : -1));
    toast("Sesión guardada 💪");
    go("#/days");
  } catch (e) {
    console.error(e);
    toast("No se pudo guardar. Revisa las reglas de Firestore.", true);
    btn.disabled = false; btn.textContent = "Guardar sesión";
  }
}

function renderHistory() {
  let inner;
  if (state.sessions.length === 0) {
    inner = `<div class="empty"><div class="big">Aún no hay entrenos</div><p>Registra tu primera sesión y aparecerá aquí.</p></div>`;
  } else {
    inner = `<div class="hist">` + state.sessions.map((s) => {
      const n = Object.keys(s.entries || {}).length;
      const [y, m, dd] = s.date.split("-");
      return `
        <button class="histcard" data-go="#/log/${s.id}">
          <div class="d"><b>${+dd}</b>${MES[+m - 1]} ${y.slice(2)}</div>
          <div class="info">
            <div class="n">${esc(s.dayName)}</div>
            <div class="s">${n} ejercicio${n === 1 ? "" : "s"} registrados</div>
          </div>
        </button>`;
    }).join("") + `</div>`;
  }
  shell(`<div class="screen">${topbar("Historial", "Tus sesiones")}${inner}</div>`, "history");
  bindCommon();
  document.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => go(b.dataset.go));
}

function renderLogDetail(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return go("#/history");
  const rows = Object.entries(s.entries || {}).map(([exId, e]) => {
    const ex = EXERCISE_INDEX[exId];
    const name = ex ? ex.name : exId;
    const unit = ex && ex.unit === "seg" ? "s" : "reps";
    const parts = [];
    if (num(e.peso) != null) parts.push(`${e.peso} kg`);
    if (num(e.reps) != null) parts.push(`${e.reps} ${unit}`);
    return `<div class="detail-ex">
      <h4>${esc(name)}</h4>
      <div class="vals">${parts.join("  ·  ") || "—"}</div>
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
  const useReps = ex && (ex.unit === "seg");
  const pts = [];
  // recorrer ascendente por fecha
  [...state.sessions].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((s) => {
    const e = s.entries && s.entries[exId];
    if (!e) return;
    const peso = num(e.peso), reps = num(e.reps);
    const value = useReps ? reps : (peso != null ? peso : reps);
    if (value != null) pts.push({ date: s.date, value, peso, reps });
  });
  return { pts, useReps };
}

function lineChart({ pts, useReps }, ex) {
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
  const unit = useReps ? (ex.unit === "seg" ? "segundos" : "reps") : "kg";
  return `
    <div class="chartcard">
      <div class="chart-legend"><span><i style="background:var(--accent)"></i>${useReps ? "Aguante" : "Peso"} (${unit})</span></div>
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        ${grid}
        <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}${labels}
      </svg>
    </div>`;
}

function renderProgress(exId) {
  const allEx = DAYS.flatMap((d) => d.exercises.map((e) => ({ ...e, dayName: d.name })));
  const current = exId && EXERCISE_INDEX[exId] ? exId : allEx[0].id;
  const ex = EXERCISE_INDEX[current];
  const data = seriesFor(current);

  // stats
  const withData = data.pts;
  const bestPeso = withData.reduce((m, p) => (p.peso != null && p.peso > m ? p.peso : m), 0);
  const bestReps = withData.reduce((m, p) => {
    const r = data.useReps ? p.value : p.reps;
    return (r != null && r > m ? r : m);
  }, 0);

  const options = DAYS.map((d) =>
    `<optgroup label="${esc(d.name)}">` +
    d.exercises.map((e) => `<option value="${e.id}" ${e.id === current ? "selected" : ""}>${esc(e.name)}</option>`).join("") +
    `</optgroup>`).join("");

  shell(`
    <div class="screen">
      ${topbar("Progreso", "Tu evolución")}
      <select class="exselect" id="exsel">${options}</select>
      ${lineChart(data, ex)}
      <div class="statgrid">
        <div class="stat"><div class="k">Sesiones</div><div class="v">${withData.length}</div></div>
        <div class="stat"><div class="k">${data.useReps ? "Mejor aguante" : "Mejor peso"}</div><div class="v">${data.useReps ? bestReps : bestPeso}<small> ${data.useReps ? (ex.unit === "seg" ? "s" : "reps") : "kg"}</small></div></div>
        <div class="stat"><div class="k">Mejor reps</div><div class="v">${bestReps || "—"}</div></div>
      </div>
      <div class="divider"><span class="label">Objetivo</span><span class="rule"></span></div>
      <p class="sub">${esc(ex.scheme)} · RIR ${esc(ex.rir)}. ${suggestion(ex).text}</p>
    </div>`, "progress");
  bindCommon();
  $("#exsel").onchange = (e) => go("#/progress/" + e.target.value);
}

function renderPrinciples() {
  const cards = PRINCIPLES.map((p) =>
    `<div class="pcard"><h3>${esc(p.title)}</h3><p>${esc(p.body)}</p></div>`).join("");
  shell(`
    <div class="screen">
      ${topbar("Guía", "Principios de la rutina")}
      <div class="princ">${cards}</div>
      <p class="save-hint" style="margin-top:18px">Los vídeos abren una búsqueda en YouTube con buenas demostraciones de cada ejercicio.</p>
    </div>`, "principios");
  bindCommon();
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
      if (!location.hash) go("#/days"); else render();
    } else {
      state.loaded = false; state.sessions = [];
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
