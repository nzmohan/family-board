import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, DEFAULT_COLUMNS } from "./config.js";

const VERSION = "1.0";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 5 } } });

const $ = (id) => document.getElementById(id);
const colors = ["#0e9f8e", "#8b5cf6"]; // person 1, person 2
const colDot = { ideas: "var(--ideas)", todo: "var(--todo)", doing: "var(--doing)", done: "var(--done)" };

let state = {
  settings: null,          // { passhash, names:[a,b], labels:{key:label} }
  cards: [],
  me: localStorage.getItem("fb_me") || null,
  columns: DEFAULT_COLUMNS.map(c => ({ ...c })),
  activeCol: "ideas",
};

/* ---------------- helpers ---------------- */
async function sha(text){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
}
function toast(msg){
  const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.add("hidden"), 2200);
}
function timeAgo(iso){
  const s = Math.floor((Date.now() - new Date(iso).getTime())/1000);
  if (s < 60) return "just now";
  const m = Math.floor(s/60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h/24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
function personIndex(name){ return state.settings?.names?.[1] === name ? 1 : 0; }
function labelFor(key){ return state.settings?.labels?.[key] || DEFAULT_COLUMNS.find(c=>c.key===key)?.label || key; }
function show(el){ $(el).classList.remove("hidden"); }
function hide(el){ $(el).classList.add("hidden"); }

/* ---------------- settings (shared via supabase) ---------------- */
async function loadSettings(){
  const { data } = await sb.from("settings").select("*").eq("key","config").maybeSingle();
  state.settings = data ? data.value : null;
}
async function saveSettings(){
  await sb.from("settings").upsert({ key:"config", value: state.settings });
}

/* ---------------- cards ---------------- */
async function loadCards(){
  const { data, error } = await sb.from("cards").select("*").order("position",{ascending:false});
  if (error){ toast("Connection issue — retrying…"); return; }
  state.cards = data || [];
  renderBoard();
}
function cardsIn(key){ return state.cards.filter(c => c.column_key === key); }

async function addCard(text){
  const card = {
    text: text.trim(),
    column_key: state.activeCol,
    author: state.me,
    position: Date.now(),
  };
  // optimistic
  const temp = { ...card, id:"temp-"+Date.now(), created_at:new Date().toISOString() };
  state.cards.unshift(temp); renderBoard();
  const { error } = await sb.from("cards").insert(card);
  if (error){ toast("Couldn't save — check connection"); }
  loadCards();
}
async function moveCard(id, key){
  state.cards = state.cards.map(c => c.id===id ? {...c, column_key:key, position:Date.now()} : c);
  renderBoard();
  await sb.from("cards").update({ column_key:key, position:Date.now(), updated_at:new Date().toISOString() }).eq("id", id);
}
async function editCard(id, text){
  await sb.from("cards").update({ text, updated_at:new Date().toISOString() }).eq("id", id);
  loadCards();
}
async function deleteCard(id){
  state.cards = state.cards.filter(c => c.id!==id); renderBoard();
  await sb.from("cards").delete().eq("id", id);
}

/* ---------------- render ---------------- */
function renderTopbar(){
  $("me-name").textContent = state.me || "—";
  $("me-dot").style.background = colors[personIndex(state.me)] || "#fff";
}
function renderTabs(){
  const tabs = $("tabs"); tabs.innerHTML = "";
  state.columns.forEach(c => {
    const b = document.createElement("button");
    b.className = "tab" + (c.key===state.activeCol ? " active":"");
    b.innerHTML = `<span class="dot" style="background:${colDot[c.key]}"></span>${labelFor(c.key)}
      <span class="count">${cardsIn(c.key).length}</span>`;
    b.onclick = () => { state.activeCol = c.key; scrollToCol(c.key); renderTabs(); };
    tabs.appendChild(b);
  });
}
function scrollToCol(key){
  const el = document.querySelector(`.column[data-key="${key}"]`);
  if (el) el.scrollIntoView({ behavior:"smooth", inline:"start", block:"nearest" });
}
function renderBoard(){
  renderTopbar(); renderTabs();
  const board = $("board"); board.innerHTML = "";
  state.columns.forEach(c => {
    const col = document.createElement("section");
    col.className = "column"; col.dataset.key = c.key;
    const list = cardsIn(c.key);
    col.innerHTML = `<div class="col-head"><span class="dot" style="background:${colDot[c.key]}"></span>
      ${labelFor(c.key)}<span class="count">${list.length}</span></div>`;
    if (!list.length){
      const e = document.createElement("div"); e.className="col-empty";
      e.textContent = c.key==="ideas" ? "Nothing here yet — add your first idea below 👇" : "Empty";
      col.appendChild(e);
    }
    list.forEach(card => col.appendChild(renderCard(card, c.key)));
    board.appendChild(col);
  });
}
function renderCard(card, key){
  const idx = state.columns.findIndex(c=>c.key===key);
  const el = document.createElement("div");
  el.className = "card";
  const pi = personIndex(card.author);
  const ini = (card.author||"?").trim().charAt(0).toUpperCase();
  el.innerHTML = `
    <div class="card-text"></div>
    <div class="card-foot">
      <span class="author"><span class="ini" style="background:${colors[pi]}">${ini}</span>${card.author||""}</span>
      <span class="card-when">${timeAgo(card.created_at)}</span>
      <span class="nav-btns">
        <button class="mv-l" ${idx<=0?"disabled":""} title="Move left">‹</button>
        <button class="mv-r" ${idx>=state.columns.length-1?"disabled":""} title="Move right">›</button>
      </span>
    </div>`;
  el.querySelector(".card-text").textContent = card.text;
  el.querySelector(".card-text").onclick = () => openSheet(card);
  el.querySelector(".mv-l").onclick = (e)=>{ e.stopPropagation(); if(idx>0) moveCard(card.id, state.columns[idx-1].key); };
  el.querySelector(".mv-r").onclick = (e)=>{ e.stopPropagation(); if(idx<state.columns.length-1) moveCard(card.id, state.columns[idx+1].key); };
  return el;
}

/* ---------------- card action sheet ---------------- */
let sheetCard = null;
function openSheet(card){
  sheetCard = card;
  $("sheet-text").textContent = card.text;
  $("sheet-meta").textContent = `Added by ${card.author||"someone"} · ${timeAgo(card.created_at)}`;
  const moves = $("sheet-moves"); moves.innerHTML = "";
  state.columns.forEach(c => {
    const b = document.createElement("button");
    if (c.key===card.column_key) b.className = "current";
    b.innerHTML = `<span class="dot" style="background:${colDot[c.key]}"></span>${labelFor(c.key)}`;
    b.onclick = () => { moveCard(card.id, c.key); closeSheet(); toast(`Moved to ${labelFor(c.key)}`); };
    moves.appendChild(b);
  });
  show("sheet");
}
function closeSheet(){ hide("sheet"); sheetCard = null; }

/* ---------------- export for Claude ---------------- */
function buildExport(){
  let out = `# Our Family Board — export\n_${new Date().toLocaleString()}_\n`;
  state.columns.forEach(c => {
    const list = cardsIn(c.key);
    out += `\n## ${labelFor(c.key)} (${list.length})\n`;
    if (!list.length){ out += `_none_\n`; return; }
    list.forEach(card => { out += `- ${card.text}  _(— ${card.author||"?"}, ${new Date(card.created_at).toLocaleDateString()})_\n`; });
  });
  out += `\n---\nSend this to Claude and say what you'd like to do with it.\n`;
  return out;
}
async function exportForClaude(){
  const text = buildExport();
  try { await navigator.clipboard.writeText(text); toast("✅ Copied — paste it into Claude"); }
  catch { toast("Copied to download instead"); }
  // also offer a file
  const blob = new Blob([text], { type:"text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "family-board.md"; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

/* ---------------- flows: gate / who ---------------- */
async function boot(){
  await loadSettings();
  // apply shared labels/columns
  if (state.settings?.labels){
    state.columns = DEFAULT_COLUMNS.map(c => ({ key:c.key, label: state.settings.labels[c.key] || c.label }));
  }
  if (!state.settings){ // first run ever
    show("gate"); $("gate-unlock").classList.add("hidden"); $("gate-setup").classList.remove("hidden");
    $("gate-title").textContent = "Set up your family board";
    $("gate-sub").textContent = "Just takes a moment.";
    return;
  }
  const unlocked = localStorage.getItem("fb_unlocked") === state.settings.passhash;
  if (!unlocked){ show("gate"); return; }
  if (!state.me || !state.settings.names.includes(state.me)){ askWho(); return; }
  enterApp();
}
function askWho(){
  hide("gate"); show("who");
  const opts = $("who-options"); opts.innerHTML = "";
  state.settings.names.forEach((n,i) => {
    const b = document.createElement("button");
    b.className = "btn"; b.style.borderColor = colors[i]; b.style.color = colors[i];
    b.innerHTML = `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${colors[i]};margin-right:8px"></span>${n}`;
    b.onclick = () => { state.me = n; localStorage.setItem("fb_me", n); hide("who"); enterApp(); };
    opts.appendChild(b);
  });
}
async function enterApp(){
  hide("gate"); hide("who"); show("app");
  $("set-version").textContent = `Our Family Board v${VERSION}`;
  await loadCards();
  subscribe();
}

/* ---------------- realtime ---------------- */
function subscribe(){
  sb.channel("board")
    .on("postgres_changes", { event:"*", schema:"public", table:"cards" }, () => loadCards())
    .on("postgres_changes", { event:"*", schema:"public", table:"settings" }, async () => {
      await loadSettings();
      if (state.settings?.labels)
        state.columns = DEFAULT_COLUMNS.map(c => ({ key:c.key, label: state.settings.labels[c.key] || c.label }));
      renderBoard();
    })
    .subscribe();
}

/* ---------------- wire up events ---------------- */
// gate unlock
$("gate-unlock-btn").onclick = async () => {
  const v = $("gate-pass").value.trim();
  if (!v) return;
  if (await sha(v) === state.settings.passhash){
    localStorage.setItem("fb_unlocked", state.settings.passhash);
    hide("gate"); $("gate-err").classList.add("hidden");
    if (!state.me || !state.settings.names.includes(state.me)) askWho(); else enterApp();
  } else {
    $("gate-err").textContent = "That passcode didn't match. Try again.";
    $("gate-err").classList.remove("hidden");
  }
};
$("gate-pass").addEventListener("keydown", e => { if (e.key==="Enter") $("gate-unlock-btn").click(); });

// first-time setup
$("setup-btn").onclick = async () => {
  const pass = $("setup-pass").value.trim();
  const n1 = $("setup-name1").value.trim() || "Me";
  const n2 = $("setup-name2").value.trim() || "Partner";
  if (pass.length < 3){ $("setup-err").textContent = "Pick a passcode of at least 3 characters."; $("setup-err").classList.remove("hidden"); return; }
  state.settings = { passhash: await sha(pass), names:[n1,n2], labels:{} };
  await saveSettings();
  localStorage.setItem("fb_unlocked", state.settings.passhash);
  state.me = n1; localStorage.setItem("fb_me", n1);
  enterApp();
};

// add card
$("add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("add-text").value;
  if (!t.trim()) return;
  addCard(t);
  $("add-text").value = ""; $("add-text").style.height = "auto";
  $("add-text").focus();
});
$("add-text").addEventListener("input", function(){
  this.style.height = "auto"; this.style.height = Math.min(this.scrollHeight, 140) + "px";
});
// Enter to add (Shift+Enter = newline)
$("add-text").addEventListener("keydown", (e) => {
  if (e.key==="Enter" && !e.shiftKey){ e.preventDefault(); $("add-form").requestSubmit(); }
});

// sheet actions
$("sheet-cancel").onclick = closeSheet;
$("sheet").onclick = (e) => { if (e.target.id==="sheet") closeSheet(); };
$("sheet-delete").onclick = () => { if (sheetCard && confirm("Delete this card?")){ deleteCard(sheetCard.id); closeSheet(); } };
$("sheet-edit").onclick = () => {
  if (!sheetCard) return;
  const v = prompt("Edit:", sheetCard.text);
  if (v!==null && v.trim()){ editCard(sheetCard.id, v.trim()); }
  closeSheet();
};

// export
$("btn-export").onclick = exportForClaude;
$("set-export").onclick = () => { hide("settings"); exportForClaude(); };

// settings
$("btn-settings").onclick = () => {
  $("set-name1").value = state.settings.names[0];
  $("set-name2").value = state.settings.names[1];
  const wrap = $("set-columns"); wrap.innerHTML = "";
  DEFAULT_COLUMNS.forEach(c => {
    const row = document.createElement("label"); row.className = "field";
    row.innerHTML = `<span>${c.label}</span><input class="big-input" data-col="${c.key}" type="text" value="${labelFor(c.key)}">`;
    wrap.appendChild(row);
  });
  show("settings");
};
$("settings").onclick = (e) => { if (e.target.id==="settings") hide("settings"); };
$("set-cancel").onclick = () => hide("settings");
$("set-save").onclick = async () => {
  state.settings.names = [ $("set-name1").value.trim()||"Me", $("set-name2").value.trim()||"Partner" ];
  const labels = {};
  document.querySelectorAll("#set-columns input").forEach(i => labels[i.dataset.col] = i.value.trim() || i.dataset.col);
  state.settings.labels = labels;
  await saveSettings();
  state.columns = DEFAULT_COLUMNS.map(c => ({ key:c.key, label: labels[c.key] || c.label }));
  // if my name no longer exists, re-pick
  if (!state.settings.names.includes(state.me)){ state.me = state.settings.names[0]; localStorage.setItem("fb_me", state.me); }
  hide("settings"); renderBoard(); toast("Saved");
};
$("set-switch").onclick = () => { hide("settings"); askWho(); };
$("set-lock").onclick = () => { localStorage.removeItem("fb_unlocked"); location.reload(); };

// register service worker (installable PWA)
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

boot();
