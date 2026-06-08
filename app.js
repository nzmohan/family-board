import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, FAMILY_EMAIL, GOOGLE_CLIENT_ID, DEFAULT_COLUMNS } from "./config.js";

const VERSION = "2.0";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 5 } } });

const $ = (id) => document.getElementById(id);
const colors = ["#0e9f8e", "#8b5cf6"]; // person 1, person 2
const colDot = { ideas: "var(--ideas)", todo: "var(--todo)", doing: "var(--doing)", done: "var(--done)" };

let state = {
  settings: null,          // { names:[a,b], labels:{key:label} }
  cards: [],
  lists: [],               // [{id,title,...}]
  listItems: [],           // [{id,list_id,text,done,...}]
  events: [],              // [{id,title,event_date,event_time,notes,...}]
  me: localStorage.getItem("fb_me") || null,
  columns: DEFAULT_COLUMNS.map(c => ({ ...c })),
  activeCol: "ideas",
  view: "board",
  openListId: null,
  editingDateId: null,
};

/* ---------------- helpers ---------------- */
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
function applyLabels(){
  if (state.settings?.labels)
    state.columns = DEFAULT_COLUMNS.map(c => ({ key:c.key, label: state.settings.labels[c.key] || c.label }));
}
async function afterAuthed(){
  await loadSettings(); applyLabels();
  if (state.settings?.names?.length){
    if (!state.me || !state.settings.names.includes(state.me)) askWho(); else enterApp();
  } else {
    showNamesSetup(); // account exists but no names yet
  }
}
async function boot(){
  const { data:{ session } } = await sb.auth.getSession();
  if (session){ await afterAuthed(); return; }
  // not signed in → ask for the family passcode
  show("gate");
  $("gate-unlock").classList.remove("hidden");
  $("gate-setup").classList.add("hidden");
  $("gate-title").textContent = "Our Family Board";
  $("gate-sub").textContent = "Enter the family passcode";
}
function showNamesSetup(){
  show("gate");
  $("gate-unlock").classList.add("hidden");
  $("gate-setup").classList.remove("hidden");
  $("gate-title").textContent = "Welcome 👋";
  $("gate-sub").textContent = "Set your names to get started.";
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
  await Promise.all([ loadCards(), loadLists(), loadEvents() ]);
  switchView(state.view);
  subscribe();
}

/* ---------------- realtime ---------------- */
function subscribe(){
  sb.channel("board")
    .on("postgres_changes", { event:"*", schema:"public", table:"cards" }, () => loadCards())
    .on("postgres_changes", { event:"*", schema:"public", table:"lists" }, () => loadLists())
    .on("postgres_changes", { event:"*", schema:"public", table:"list_items" }, () => loadLists())
    .on("postgres_changes", { event:"*", schema:"public", table:"events" }, () => loadEvents())
    .on("postgres_changes", { event:"*", schema:"public", table:"settings" }, async () => {
      await loadSettings();
      if (state.settings?.labels)
        state.columns = DEFAULT_COLUMNS.map(c => ({ key:c.key, label: state.settings.labels[c.key] || c.label }));
      renderBoard();
    })
    .subscribe();
}

/* ---------------- view switching ---------------- */
function switchView(view){
  state.view = view;
  ["board","lists","dates"].forEach(v => $("view-"+v).classList.toggle("hidden", v!==view));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view===view));
  if (view==="board") renderBoard();
  if (view==="lists") renderLists();
  if (view==="dates") renderDates();
}

/* ================= LISTS ================= */
async function loadLists(){
  const [{ data:lists }, { data:items }] = await Promise.all([
    sb.from("lists").select("*").order("position",{ascending:true}),
    sb.from("list_items").select("*").order("position",{ascending:true}),
  ]);
  state.lists = lists || []; state.listItems = items || [];
  if (state.view==="lists") renderLists();
  if (state.openListId) renderListItems();
}
function itemsOf(listId){ return state.listItems.filter(i => i.list_id===listId); }
async function addList(title){
  const { data } = await sb.from("lists").insert({ title: title.trim(), position: Date.now() }).select().single();
  loadLists();
  if (data) openList(data.id);
}
async function renameList(id, title){ await sb.from("lists").update({ title }).eq("id", id); loadLists(); }
async function deleteList(id){ await sb.from("lists").delete().eq("id", id); loadLists(); }
async function addItem(listId, text){
  const item = { list_id:listId, text:text.trim(), author:state.me, position:Date.now() };
  state.listItems.push({ ...item, id:"t"+Date.now(), done:false }); renderListItems();
  await sb.from("list_items").insert(item); loadLists();
}
async function toggleItem(id, done){
  state.listItems = state.listItems.map(i => i.id===id ? {...i, done} : i); renderListItems();
  await sb.from("list_items").update({ done }).eq("id", id);
}
async function deleteItem(id){
  state.listItems = state.listItems.filter(i => i.id!==id); renderListItems();
  await sb.from("list_items").delete().eq("id", id);
}
async function clearDone(listId){
  const ids = itemsOf(listId).filter(i=>i.done).map(i=>i.id);
  if (!ids.length){ toast("Nothing ticked yet"); return; }
  state.listItems = state.listItems.filter(i => !ids.includes(i.id)); renderListItems();
  await sb.from("list_items").delete().in("id", ids); loadLists();
}
function renderLists(){
  const wrap = $("lists"); wrap.innerHTML = "";
  if (!state.lists.length){
    wrap.innerHTML = `<div class="list-empty">No lists yet.<br>Make one below — e.g. <b>Grocery</b> or <b>House items</b>.</div>`;
    return;
  }
  state.lists.forEach(l => {
    const items = itemsOf(l.id);
    const open = items.filter(i=>!i.done).length;
    const card = document.createElement("div");
    card.className = "list-card";
    card.innerHTML = `<span class="lc-title"></span>
      <span class="lc-count">${open} left${items.length?` · ${items.length}`:""}</span>
      <span class="lc-arrow">›</span>`;
    card.querySelector(".lc-title").textContent = l.title;
    card.onclick = () => openList(l.id);
    wrap.appendChild(card);
  });
}
function openList(id){ state.openListId = id; renderListItems(); show("list-sheet"); }
function renderListItems(){
  const list = state.lists.find(l => l.id===state.openListId);
  if (!list){ hide("list-sheet"); return; }
  $("list-sheet-title").textContent = list.title;
  const wrap = $("list-items"); wrap.innerHTML = "";
  const items = itemsOf(list.id).slice().sort((a,b)=> (a.done?1:0)-(b.done?1:0));
  if (!items.length){ wrap.innerHTML = `<div class="list-empty">Empty — add your first item below.</div>`; }
  items.forEach(it => {
    const row = document.createElement("div");
    row.className = "li" + (it.done?" done":"");
    row.innerHTML = `<button class="check">${it.done?"✓":""}</button>
      <span class="li-text"></span><button class="li-del">✕</button>`;
    row.querySelector(".li-text").textContent = it.text;
    row.querySelector(".check").onclick = () => toggleItem(it.id, !it.done);
    row.querySelector(".li-text").onclick = () => toggleItem(it.id, !it.done);
    row.querySelector(".li-del").onclick = () => deleteItem(it.id);
    wrap.appendChild(row);
  });
}

/* ================= DATES ================= */
async function loadEvents(){
  const { data } = await sb.from("events").select("*").order("event_date",{ascending:true});
  state.events = data || [];
  if (state.view==="dates") renderDates();
}
function fmtDateSub(ev){
  const d = new Date(ev.event_date + "T00:00:00");
  let s = d.toLocaleDateString(undefined, { weekday:"long", day:"numeric", month:"long" });
  if (ev.event_time) s += " · " + ev.event_time;
  if (ev.notes) s += " · " + ev.notes;
  return s;
}
// Build a one-tap "Add to Google Calendar" link (no setup needed)
function gcalLink(ev){
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const d = ev.event_date.replace(/-/g,"");
  let dates;
  if (ev.event_time){
    const start = d + "T" + ev.event_time.replace(":","") + "00";
    const [h,m] = ev.event_time.split(":").map(Number);
    const endH = String((h+1)%24).padStart(2,"0");
    dates = `${start}/${d}T${endH}${String(m).padStart(2,"0")}00`;
  } else {
    const nd = new Date(ev.event_date+"T00:00:00"); nd.setDate(nd.getDate()+1);
    const nds = `${nd.getFullYear()}${String(nd.getMonth()+1).padStart(2,"0")}${String(nd.getDate()).padStart(2,"0")}`;
    dates = `${d}/${nds}`;
  }
  const p = new URLSearchParams({ text: ev.title, dates });
  if (ev.notes) p.set("details", ev.notes);
  return `${base}&${p.toString()}`;
}
function renderDates(){
  const wrap = $("dates"); wrap.innerHTML = "";
  // Google connect banner (only when auto-sync is configured)
  if (GOOGLE_CLIENT_ID){
    const b = document.createElement("div"); b.className = "gcal-banner";
    if (gcalToken()){
      b.innerHTML = `<b>Google Calendar connected.</b> New dates sync automatically.
        <button class="btn" id="gcal-disconnect">Disconnect</button>`;
    } else {
      b.innerHTML = `<b>Connect Google Calendar</b> to auto-add your dates.
        <button class="btn primary" id="gcal-connect">Connect</button>`;
    }
    wrap.appendChild(b);
    const c = $("gcal-connect"); if (c) c.onclick = () => gcalConnect(true);
    const d = $("gcal-disconnect"); if (d) d.onclick = () => { localStorage.removeItem("fb_gcal"); renderDates(); };
  }
  const today = new Date(); today.setHours(0,0,0,0);
  const upcoming = state.events.filter(e => new Date(e.event_date+"T00:00:00") >= today);
  const past = state.events.filter(e => new Date(e.event_date+"T00:00:00") < today);
  if (!state.events.length){
    const e = document.createElement("div"); e.className="list-empty";
    e.innerHTML = "No dates yet.<br>Add things like recitals, appointments and birthdays.";
    wrap.appendChild(e);
  }
  [...upcoming, ...past].forEach(ev => wrap.appendChild(renderDateCard(ev)));
}
function renderDateCard(ev){
  const d = new Date(ev.event_date+"T00:00:00");
  const el = document.createElement("div"); el.className = "date-card";
  el.innerHTML = `
    <div class="date-chip"><div class="d">${d.getDate()}</div>
      <div class="m">${d.toLocaleDateString(undefined,{month:"short"})}</div></div>
    <div class="date-body">
      <div class="dt-title"></div>
      <div class="dt-sub"></div>
      <div class="date-actions"></div>
    </div>`;
  el.querySelector(".dt-title").textContent = ev.title;
  el.querySelector(".dt-sub").textContent = fmtDateSub(ev);
  const actions = el.querySelector(".date-actions");
  // Google calendar control: auto if synced, else one-tap link
  if (ev.gcal_synced){
    const s = document.createElement("span"); s.className = "synced"; s.textContent = "✓ In Google Calendar";
    actions.appendChild(s);
  } else if (GOOGLE_CLIENT_ID && gcalToken()){
    const btn = document.createElement("button"); btn.className = "gcal"; btn.textContent = "📅 Add to Google Calendar";
    btn.onclick = () => pushToGoogle(ev);
    actions.appendChild(btn);
  } else {
    const a = document.createElement("a"); a.className = "gcal"; a.href = gcalLink(ev); a.target = "_blank"; a.rel="noopener";
    a.textContent = "📅 Add to Calendar";
    actions.appendChild(a);
  }
  const edit = document.createElement("button"); edit.textContent = "Edit";
  edit.onclick = () => openDateSheet(ev);
  actions.appendChild(edit);
  return el;
}
function openDateSheet(ev){
  state.editingDateId = ev ? ev.id : null;
  $("date-sheet-title").textContent = ev ? "Edit date" : "Add a date";
  $("date-title").value = ev?.title || "";
  $("date-date").value = ev?.event_date || "";
  $("date-time").value = ev?.event_time || "";
  $("date-notes").value = ev?.notes || "";
  $("date-delete").classList.toggle("hidden", !ev);
  show("date-sheet");
}
async function saveDate(){
  const title = $("date-title").value.trim();
  const event_date = $("date-date").value;
  if (!title || !event_date){ toast("Add a name and a date"); return; }
  const row = { title, event_date, event_time: $("date-time").value || null, notes: $("date-notes").value.trim() || null };
  let saved;
  if (state.editingDateId){
    ({ data:saved } = await sb.from("events").update({ ...row, gcal_synced:false }).eq("id", state.editingDateId).select().single());
  } else {
    row.author = state.me;
    ({ data:saved } = await sb.from("events").insert(row).select().single());
  }
  hide("date-sheet"); await loadEvents();
  // auto-sync to Google if connected
  if (saved && GOOGLE_CLIENT_ID && gcalToken()) pushToGoogle(saved);
}

/* ================= GOOGLE CALENDAR ================= */
function gcalToken(){
  try {
    const t = JSON.parse(localStorage.getItem("fb_gcal") || "null");
    if (t && t.token && t.exp > Date.now()) return t.token;
  } catch {}
  return null;
}
let tokenClient = null;
function initTokenClient(cb){
  if (!window.google?.accounts?.oauth2){ toast("Google library still loading — try again in a moment"); return null; }
  return google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: "https://www.googleapis.com/auth/calendar.events",
    callback: (resp) => {
      if (resp.access_token){
        localStorage.setItem("fb_gcal", JSON.stringify({ token: resp.access_token, exp: Date.now() + (resp.expires_in||3500)*1000 }));
        toast("✅ Google Calendar connected");
        renderDates(); cb && cb();
      }
    },
  });
}
function gcalConnect(interactive){
  if (!GOOGLE_CLIENT_ID){ toast("Google sign-in isn't set up yet"); return; }
  tokenClient = tokenClient || initTokenClient();
  if (!tokenClient) return;
  tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
}
async function pushToGoogle(ev){
  const token = gcalToken();
  if (!token){ gcalConnect(true); return; }
  const body = ev.event_time
    ? { summary: ev.title, description: ev.notes||"",
        start:{ dateTime: `${ev.event_date}T${ev.event_time}:00`, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        end:{ dateTime: `${ev.event_date}T${String((parseInt(ev.event_time)+1)%24).padStart(2,"0")}${ev.event_time.slice(2)}:00`, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } }
    : { summary: ev.title, description: ev.notes||"",
        start:{ date: ev.event_date }, end:{ date: ev.event_date } };
  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method:"POST", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" }, body: JSON.stringify(body),
    });
    if (res.ok){ await sb.from("events").update({ gcal_synced:true }).eq("id", ev.id); toast("✅ Added to Google Calendar"); loadEvents(); }
    else if (res.status===401){ localStorage.removeItem("fb_gcal"); gcalConnect(true); }
    else { toast("Couldn't add to Google Calendar"); }
  } catch { toast("Calendar connection failed"); }
}

/* ---------------- wire up events ---------------- */
// bottom nav
document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => switchView(b.dataset.view));

// lists
$("new-list-btn").onclick = () => {
  const v = $("new-list-name").value.trim(); if (!v) return;
  addList(v); $("new-list-name").value = "";
};
$("new-list-name").addEventListener("keydown", e => { if (e.key==="Enter"){ e.preventDefault(); $("new-list-btn").click(); } });
$("list-add-form").addEventListener("submit", e => {
  e.preventDefault();
  const v = $("list-add-text").value.trim(); if (!v || !state.openListId) return;
  addItem(state.openListId, v); $("list-add-text").value = ""; $("list-add-text").focus();
});
$("list-rename").onclick = () => {
  const list = state.lists.find(l=>l.id===state.openListId); if (!list) return;
  const v = prompt("Rename list:", list.title); if (v!==null && v.trim()) renameList(list.id, v.trim());
};
$("list-clear-done").onclick = () => { if (state.openListId) clearDone(state.openListId); };
$("list-delete").onclick = () => {
  if (state.openListId && confirm("Delete this whole list?")){ deleteList(state.openListId); state.openListId=null; hide("list-sheet"); }
};
$("list-close").onclick = () => { state.openListId=null; hide("list-sheet"); };
$("list-sheet").onclick = e => { if (e.target.id==="list-sheet"){ state.openListId=null; hide("list-sheet"); } };

// dates
$("new-date-btn").onclick = () => openDateSheet(null);
$("date-save").onclick = saveDate;
$("date-cancel").onclick = () => hide("date-sheet");
$("date-sheet").onclick = e => { if (e.target.id==="date-sheet") hide("date-sheet"); };
$("date-delete").onclick = async () => {
  if (state.editingDateId && confirm("Delete this date?")){
    await sb.from("events").delete().eq("id", state.editingDateId);
    hide("date-sheet"); loadEvents();
  }
};

// gate unlock — passcode IS the family account password (enforced server-side)
$("gate-unlock-btn").onclick = async () => {
  const v = $("gate-pass").value.trim();
  if (!v) return;
  const btn = $("gate-unlock-btn"); btn.disabled = true; btn.textContent = "Checking…";
  $("gate-err").classList.add("hidden");
  try {
    // try to sign in to the existing board
    let { error } = await sb.auth.signInWithPassword({ email: FAMILY_EMAIL, password: v });
    if (!error){ hide("gate"); await afterAuthed(); return; }
    // not signed in — maybe this is the very first setup: create the board
    let { data, error: se } = await sb.auth.signUp({ email: FAMILY_EMAIL, password: v });
    if (!se){
      if (!data.session){ // ensure we have a session
        const r = await sb.auth.signInWithPassword({ email: FAMILY_EMAIL, password: v });
        if (r.error) throw r.error;
      }
      hide("gate"); showNamesSetup(); return; // first run → collect names
    }
    if (/already registered/i.test(se.message)){
      $("gate-err").textContent = "That passcode didn't match. Try again.";
    } else if (/at least 6|password/i.test(se.message)){
      $("gate-err").textContent = "First time? Choose a passcode of at least 6 characters.";
    } else {
      $("gate-err").textContent = se.message;
    }
    $("gate-err").classList.remove("hidden");
  } catch (e){
    $("gate-err").textContent = e.message || "Something went wrong. Check your connection.";
    $("gate-err").classList.remove("hidden");
  } finally {
    btn.disabled = false; btn.textContent = "Open";
  }
};
$("gate-pass").addEventListener("keydown", e => { if (e.key==="Enter") $("gate-unlock-btn").click(); });

// first-time setup: names only (we're already signed in by now)
$("setup-btn").onclick = async () => {
  const n1 = $("setup-name1").value.trim() || "Me";
  const n2 = $("setup-name2").value.trim() || "Partner";
  state.settings = { names:[n1,n2], labels: state.settings?.labels || {} };
  await saveSettings();
  state.me = n1; localStorage.setItem("fb_me", n1);
  hide("gate"); enterApp();
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
$("set-lock").onclick = async () => { await sb.auth.signOut(); location.reload(); };

// register service worker (installable PWA)
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

boot();
