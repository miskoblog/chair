/* ==========================================================================
   Chair — the three jobs Click Staff AI hands back to you.
   Fully static: no API calls, no accounts, no backend. localStorage only.
   ========================================================================== */

const GATE_HASH = "0e5190fcab67fcbae9426217ae055bcb3814eb7e2274631ade1831dcda231a53";
const NS = "chair";

/* ---------------------------------------------------------------- utilities */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

/** Join sentence fragments with exactly one space, dropping empties.
 *  Guards against the double-space bug that appears when a field is blank. */
function joinParts(parts) {
  return parts.filter((p) => p != null && String(p).trim() !== "").map((p) => String(p).trim()).join(" ");
}

function titleCase(s) {
  return String(s || "").replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 1800);
}

function copyText(text) {
  if (!text) { showToast("Nothing to copy yet"); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast("Copied")).catch(() => showToast("Copy failed"));
  } else {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); showToast("Copied"); } catch (e) { showToast("Copy failed"); }
    document.body.removeChild(ta);
  }
}

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + "_" + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) { return fallback; }
}

function lsSet(key, value) {
  try { localStorage.setItem(NS + "_" + key, JSON.stringify(value)); } catch (e) { /* quota / private mode */ }
}

/* ---------------------------------------------------------------- workspaces

   Each business is a workspace: its own drafts, saved entries, Ship Tracker
   pipeline, Command Ledger and Scorecard verdicts. Global keys (access, theme,
   the profile list itself) stay unprefixed; everything else is namespaced by
   the active business id. */

let ACTIVE_PROFILE_ID = null;

const WORKSPACE_KEYS = [
  "draft_composer", "draft_splitter", "draft_splitter_desc", "draft_breaker",
  "draft_scorecard", "draft_claims", "draft_drift", "draft_runway",
  "tracker_rows", "ledger_entries", "asset_verdicts",
  "saved_composer", "saved_splitter", "saved_breaker", "saved_scorecard",
  "saved_claims", "saved_drift", "saved_runway", "saved_tracker", "saved_ledger",
];

function wsKey(key) { return "p_" + ACTIVE_PROFILE_ID + "_" + key; }
function wsGet(key, fallback) { return lsGet(wsKey(key), fallback); }
function wsSet(key, value) { lsSet(wsKey(key), value); }

function newProfileId() {
  return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

/** Reads the business list, creating one (and migrating any single-profile
 *  data from before workspaces existed) on first run. */
function loadProfiles() {
  let profiles = lsGet("profiles", null);
  if (Array.isArray(profiles) && profiles.length) return profiles;

  const old = lsGet("profile", null) || {};
  const id = newProfileId();
  profiles = [{
    id,
    name: (old.sells || "").trim() || "My business",
    sells: old.sells || "", audience: old.audience || "",
    context: old.context || "", voice: old.voice || "",
    createdAt: new Date().toISOString(),
  }];
  lsSet("profiles", profiles);
  lsSet("active_profile", id);
  // carry any pre-workspace work into the first business rather than orphaning it
  WORKSPACE_KEYS.forEach((k) => {
    const raw = localStorage.getItem(NS + "_" + k);
    if (raw !== null) {
      try { localStorage.setItem(NS + "_p_" + id + "_" + k, raw); localStorage.removeItem(NS + "_" + k); } catch (e) {}
    }
  });
  return profiles;
}

function saveProfiles(profiles) { lsSet("profiles", profiles); }

function getProfile() {
  const profiles = loadProfiles();
  return profiles.find((p) => p.id === ACTIVE_PROFILE_ID) || profiles[0];
}

function profileLabel(p) {
  return (p && (p.name || p.sells) || "My business").trim() || "My business";
}

/** Removes every workspace key belonging to one business. */
function purgeWorkspace(id) {
  WORKSPACE_KEYS.forEach((k) => {
    try { localStorage.removeItem(NS + "_p_" + id + "_" + k); } catch (e) {}
  });
}

function initWorkspace() {
  const profiles = loadProfiles();
  let active = lsGet("active_profile", null);
  if (!profiles.some((p) => p.id === active)) {
    active = profiles[0].id;
    lsSet("active_profile", active);
  }
  ACTIVE_PROFILE_ID = active;
}

function formatSavedAt(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function money(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/* ---------------------------------------------------------------- gate */

async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function initGate() {
  const gate = document.getElementById("gate");
  const form = document.getElementById("gateForm");
  const input = document.getElementById("gatePassword");
  const error = document.getElementById("gateError");
  if (gate.classList.contains("is-unlocked")) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const hash = await sha256Hex(input.value.trim());
    if (hash === GATE_HASH) {
      localStorage.setItem(NS + "_access", "granted");
      gate.classList.add("is-unlocked");
      error.classList.remove("is-visible");
    } else {
      error.classList.add("is-visible");
      input.value = "";
      input.focus();
    }
  });
}

/* ---------------------------------------------------------------- theme */

function initTheme() {
  const toggle = document.getElementById("themeToggle");
  const root = document.documentElement;
  function effectiveTheme() {
    const attr = root.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") return attr;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  toggle.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem(NS + "_theme", JSON.stringify(next).slice(1, -1));
  });
}

/* ---------------------------------------------------------------- tabs */

function initTabs() {
  const btns = document.querySelectorAll(".tab-btn");
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => { b.classList.remove("is-active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
      document.getElementById("panel-" + btn.dataset.tab).classList.add("is-active");
    });
  });
}

function initSubTabs() {
  document.querySelectorAll(".subtabs").forEach((strip) => {
    const btns = strip.querySelectorAll(".subtab-btn");
    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        btns.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        strip.parentElement.querySelectorAll(".subpanel").forEach((p) => p.classList.remove("is-active"));
        document.getElementById("sub-" + btn.dataset.sub).classList.add("is-active");
      });
    });
  });
}

/** Programmatically switch to a tab + sub-tab (used by cross-tool hand-offs). */
function goTo(tab, sub) {
  const tabBtn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
  if (tabBtn) tabBtn.click();
  if (sub) {
    const subBtn = document.querySelector('.subtab-btn[data-sub="' + sub + '"]');
    if (subBtn) subBtn.click();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------------------------------------------------------------- save/reopen */

function initSaveable({ toolId, listEl, getEntry, applyEntry, max = 50 }) {
  const key = NS + "_" + wsKey("saved_" + toolId);

  const read = () => {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
  };
  const write = (entries) => {
    try { localStorage.setItem(key, JSON.stringify(entries.slice(0, max))); } catch (e) { /* quota */ }
    render();
  };

  function render() {
    const entries = read();
    if (!entries.length) {
      listEl.innerHTML = '<p class="saved-empty">Nothing saved yet — generate something, then press Save.</p>';
      return;
    }
    listEl.innerHTML = entries.map((e) => `
      <div class="saved-item" data-id="${escapeHtml(e.id)}">
        <div class="saved-item-main">
          <div class="saved-item-name">${escapeHtml(e.name)}</div>
          <div class="saved-item-meta">${escapeHtml(e.meta)} · ${escapeHtml(formatSavedAt(e.savedAt))}</div>
        </div>
        <div class="saved-actions">
          <button class="ghost-btn" data-act="open" type="button">Open</button>
          <button class="ghost-btn" data-act="delete" type="button">Delete</button>
        </div>
      </div>`).join("");
  }

  listEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.closest(".saved-item").dataset.id;
    const entry = read().find((e) => e.id === id);
    if (!entry) return;
    if (btn.dataset.act === "open") {
      applyEntry(entry.payload);
      showToast("Opened");
    } else {
      write(read().filter((e) => e.id !== id));
      showToast("Deleted");
    }
  });

  render();

  return {
    save() {
      const entry = getEntry();
      if (!entry) { showToast("Nothing to save yet"); return; }
      write([{ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), savedAt: new Date().toISOString(), ...entry }, ...read()]);
      showToast("Saved");
    },
    count() { return read().length; },
  };
}

/* ---------------------------------------------------------------- businesses */

function initProfileUI() {
  const modal = document.getElementById("profileModal");
  const fields = { name: "pfName", sells: "pfSells", audience: "pfAudience", context: "pfContext", voice: "pfVoice" };

  function readFields() {
    const out = {};
    Object.keys(fields).forEach((k) => { out[k] = document.getElementById(fields[k]).value.trim(); });
    return out;
  }

  function writeFields(p) {
    Object.keys(fields).forEach((k) => { document.getElementById(fields[k]).value = p[k] || ""; });
  }

  function persistCurrentEdits() {
    const profiles = loadProfiles();
    const p = profiles.find((x) => x.id === ACTIVE_PROFILE_ID);
    if (!p) return;
    Object.assign(p, readFields());
    if (!p.name) p.name = (p.sells || "My business").trim() || "My business";
    saveProfiles(profiles);
  }

  function renderTopbar() {
    const btn = document.getElementById("profileBtn");
    const profiles = loadProfiles();
    const label = profileLabel(getProfile());
    btn.innerHTML = '<span class="pb-label">' + escapeHtml(label) + "</span>" +
      (profiles.length > 1 ? '<span class="pb-caret">\u25be</span>' : "");
    btn.title = profiles.length > 1
      ? "Working on " + label + " — click to switch business"
      : "Set up your business details";
  }

  function renderSelect() {
    const sel = document.getElementById("pfSelect");
    const profiles = loadProfiles();
    sel.innerHTML = profiles.map((p) =>
      '<option value="' + escapeHtml(p.id) + '"' + (p.id === ACTIVE_PROFILE_ID ? " selected" : "") + ">" + escapeHtml(profileLabel(p)) + "</option>").join("");
    document.getElementById("pfCount").textContent = profiles.length === 1
      ? "1 business set up."
      : profiles.length + " businesses set up. Each keeps its own saved work, Ship Tracker and Ledger.";
  }

  function open() {
    renderSelect();
    writeFields(getProfile());
    modal.classList.add("is-open");
  }

  function switchTo(id) {
    persistCurrentEdits();
    lsSet("active_profile", id);
    location.reload();
  }

  document.getElementById("profileBtn").addEventListener("click", open);
  document.getElementById("pfClose").addEventListener("click", () => modal.classList.remove("is-open"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("is-open"); });

  document.getElementById("pfSelect").addEventListener("change", (e) => {
    if (e.target.value !== ACTIVE_PROFILE_ID) switchTo(e.target.value);
  });

  document.getElementById("pfSave").addEventListener("click", () => {
    persistCurrentEdits();
    renderTopbar();
    renderSelect();
    modal.classList.remove("is-open");
    showToast("Business saved");
  });

  document.getElementById("pfNew").addEventListener("click", () => {
    persistCurrentEdits();
    const profiles = loadProfiles();
    const id = newProfileId();
    profiles.push({ id, name: "New business", sells: "", audience: "", context: "", voice: "", createdAt: new Date().toISOString() });
    saveProfiles(profiles);
    switchTo(id);
  });

  document.getElementById("pfDuplicate").addEventListener("click", () => {
    persistCurrentEdits();
    const profiles = loadProfiles();
    const cur = getProfile();
    const id = newProfileId();
    // copies the business details, not its saved work — the new one starts clean
    profiles.push({ id, name: profileLabel(cur) + " (copy)", sells: cur.sells, audience: cur.audience, context: cur.context, voice: cur.voice, createdAt: new Date().toISOString() });
    saveProfiles(profiles);
    switchTo(id);
  });

  document.getElementById("pfDelete").addEventListener("click", () => {
    const profiles = loadProfiles();
    if (profiles.length < 2) { showToast("You need at least one business"); return; }
    const cur = getProfile();
    if (!window.confirm('Delete "' + profileLabel(cur) + '" and all of its saved work, tracker rows and ledger entries? This cannot be undone.')) return;
    purgeWorkspace(cur.id);
    const remaining = profiles.filter((p) => p.id !== cur.id);
    saveProfiles(remaining);
    lsSet("active_profile", remaining[0].id);
    location.reload();
  });

  renderTopbar();
}

/* ==========================================================================
   MODULE 1 — BRIEF
   ========================================================================== */

/* ------------------------------------------------- Tool 1: Command Composer */

const CMP_FIELDS = {
  outcome:     { label: "The outcome you want", type: "textarea", ph: "e.g. a complete launch for my intermediate-level Facebook Ads course", required: true },
  business:    { label: "Your business context", type: "textarea", ph: "What you sell, how you sell it, anything the room must know" },
  audience:    { label: "Who it's for", type: "text", ph: "e.g. agency owners running $5k–$20k/mo in ad spend" },
  prospect:    { label: "The specific prospect", type: "text", ph: "e.g. Harbourview Dental, a 3-chair practice in Bristol" },
  competitors: { label: "Competitors to examine", type: "text", ph: "e.g. AdSkills, Foxwell Digital" },
  stack:       { label: "Stack, language or platform", type: "text", ph: "e.g. Node 20, Postgres, deployed on Railway" },
  options:     { label: "The options you're choosing between", type: "textarea", ph: "e.g. Option A: raise prices 40%. Option B: add a lower tier." },
  launchDate:  { label: "Cart-open date", type: "text", ph: "e.g. 14 October" },
  deliverables:{ label: "Deliverables you need back", type: "textarea", ph: "e.g. VSL script, 9-email sequence, affiliate swipes" },
  constraints: { label: "Constraints", type: "text", ph: "e.g. two weeks, no paid traffic budget" },
  doneWhen:    { label: "This is done when", type: "textarea", ph: "e.g. I can hand every asset to my VA without rewriting anything", required: true },
  avoid:       { label: "What to avoid", type: "text", ph: "e.g. hype language, anything implying guaranteed income" },
};

const CMP_TYPES = [
  { id: "launch",    label: "Product launch",              fields: ["outcome", "business", "audience", "launchDate", "deliverables", "constraints", "doneWhen", "avoid"] },
  { id: "pitch",     label: "Client pitch or proposal",    fields: ["outcome", "business", "prospect", "deliverables", "constraints", "doneWhen", "avoid"] },
  { id: "research",  label: "Market or competitor research",fields: ["outcome", "business", "audience", "competitors", "constraints", "doneWhen", "avoid"] },
  { id: "copy",      label: "Copy or campaign assets",     fields: ["outcome", "business", "audience", "deliverables", "constraints", "doneWhen", "avoid"] },
  { id: "technical", label: "Technical build or fix",      fields: ["outcome", "business", "stack", "deliverables", "constraints", "doneWhen", "avoid"] },
  { id: "decision",  label: "Strategic decision",          fields: ["outcome", "business", "audience", "options", "constraints", "doneWhen", "avoid"] },
];

const CMP_OPENERS = {
  launch:    (v) => "Plan and build the complete launch for " + v.outcome + ".",
  pitch:     (v) => "Build everything I need to win " + (v.prospect || "this prospect") + ": " + v.outcome + ".",
  research:  (v) => "Research this properly before I commit: " + v.outcome + ".",
  copy:      (v) => "Write and assemble the campaign assets for " + v.outcome + ".",
  technical: (v) => "Build, debug and deliver this: " + v.outcome + ".",
  decision:  (v) => "Help me decide, and argue both sides: " + v.outcome + ".",
};

/** Assembles one paste-ready boardroom command from the buyer's inputs.
 *  Returns { command, contextBlock, missing } — `missing` names required
 *  fields left blank, so the UI can say what's needed rather than emitting
 *  a half-formed command. */
function computeCommand(typeId, values) {
  const type = CMP_TYPES.find((t) => t.id === typeId) || CMP_TYPES[0];
  const v = {};
  type.fields.forEach((f) => { v[f] = (values[f] || "").trim(); });

  const missing = type.fields.filter((f) => CMP_FIELDS[f].required && !v[f]).map((f) => CMP_FIELDS[f].label);

  const parts = [
    CMP_OPENERS[type.id](v),
    v.business ? "Business context: " + v.business + "." : "",
    v.audience ? "The audience is " + v.audience + "." : "",
    v.prospect && type.id !== "pitch" ? "The prospect is " + v.prospect + "." : "",
    v.competitors ? "Examine these competitors specifically: " + v.competitors + "." : "",
    v.stack ? "The stack is " + v.stack + "." : "",
    v.options ? "The options on the table: " + v.options + "." : "",
    v.launchDate ? "Cart opens " + v.launchDate + "." : "",
    v.deliverables ? "Deliver these, finished and ready to use: " + v.deliverables + "." : "",
    v.constraints ? "Constraints you must work inside: " + v.constraints + "." : "",
    v.avoid ? "Avoid: " + v.avoid + "." : "",
    v.doneWhen ? "This is done when " + v.doneWhen + "." : "",
    "Before you deliver, have the reviewer check it against those constraints.",
  ];

  const profile = getProfile();
  const ctxParts = [
    v.business || profile.sells ? "What I sell: " + (v.business || profile.sells) + "." : "",
    v.audience || profile.audience ? "Who I sell to: " + (v.audience || profile.audience) + "." : "",
    profile.context ? "Always relevant: " + profile.context + "." : "",
    profile.voice ? "Brand voice: " + profile.voice + "." : "",
  ];
  const contextBlock = ctxParts.filter(Boolean).length
    ? joinParts(["Standing context for every project I bring you."].concat(ctxParts))
    : "";

  return { command: joinParts(parts), contextBlock, missing, typeLabel: type.label };
}

let cmpState = { type: "launch", values: {}, result: null };

function cmpRenderFields() {
  const type = CMP_TYPES.find((t) => t.id === cmpState.type);
  const host = document.getElementById("cmpFields");
  host.innerHTML = type.fields.map((f) => {
    const def = CMP_FIELDS[f];
    const val = escapeHtml(cmpState.values[f] || "");
    const req = def.required ? "" : ' <span class="optional">(optional)</span>';
    const input = def.type === "textarea"
      ? `<textarea id="cmp_${f}" placeholder="${escapeHtml(def.ph)}">${val}</textarea>`
      : `<input type="text" id="cmp_${f}" placeholder="${escapeHtml(def.ph)}" value="${val}" />`;
    return `<div class="field"><label for="cmp_${f}">${escapeHtml(def.label)}${req}</label>${input}</div>`;
  }).join("");

  type.fields.forEach((f) => {
    document.getElementById("cmp_" + f).addEventListener("input", (e) => {
      cmpState.values[f] = e.target.value;
      wsSet("draft_composer", cmpState);
    });
  });
}

function cmpRenderOut() {
  const host = document.getElementById("cmpOut");
  const r = cmpState.result;
  if (!r) { host.innerHTML = '<p class="output-placeholder">Pick a project type, fill in the fields, then press Compose Command.</p>'; return; }
  let html = "";
  if (r.missing.length) {
    html += `<div class="verdict-banner v-fix"><div class="v-title">Fill these in first</div><div class="v-sub">${escapeHtml(r.missing.join(" · "))} — the command below will be vague without them.</div></div>`;
  }
  html += `<div class="out-section"><h3>Paste this into Click Staff AI</h3><div class="cmd-block">${escapeHtml(r.command)}</div></div>`;
  if (r.contextBlock) {
    html += `<div class="out-section"><h3>Context Block <span style="text-transform:none;font-weight:400">— paste once, before your command</span></h3><div class="cmd-block">${escapeHtml(r.contextBlock)}</div></div>`;
  }
  html += `<div class="out-section"><h3>Next</h3><p class="out-p">Not sure this should be one command? Send it to Scope Splitter.</p><button class="ghost-btn" id="cmpToSplitter" type="button">Open in Scope Splitter</button></div>`;
  host.innerHTML = html;
  const btn = document.getElementById("cmpToSplitter");
  if (btn) btn.addEventListener("click", () => {
    document.getElementById("splDesc").value = cmpState.values.outcome || "";
    wsSet("draft_splitter_desc", cmpState.values.outcome || "");
    goTo("brief", "splitter");
  });
}

function initComposer() {
  const sel = document.getElementById("cmpType");
  sel.innerHTML = CMP_TYPES.map((t) => `<option value="${t.id}">${escapeHtml(t.label)}</option>`).join("");

  const draft = wsGet("draft_composer", null);
  if (draft && draft.type) cmpState = draft;
  sel.value = cmpState.type;
  cmpRenderFields();
  cmpRenderOut();

  sel.addEventListener("change", () => {
    cmpState.type = sel.value;
    cmpRenderFields();
    wsSet("draft_composer", cmpState);
  });

  document.getElementById("cmpRun").addEventListener("click", () => {
    cmpState.result = computeCommand(cmpState.type, cmpState.values);
    wsSet("draft_composer", cmpState);
    cmpRenderOut();
  });

  document.getElementById("cmpClear").addEventListener("click", () => {
    cmpState = { type: sel.value, values: {}, result: null };
    cmpRenderFields();
    cmpRenderOut();
    wsSet("draft_composer", cmpState);
    showToast("Cleared");
  });

  document.getElementById("cmpCopy").addEventListener("click", () => {
    if (!cmpState.result) { showToast("Nothing to copy yet"); return; }
    copyText(joinParts([cmpState.result.command]) + (cmpState.result.contextBlock ? "\n\n--- Context block ---\n" + cmpState.result.contextBlock : ""));
  });

  const saveable = initSaveable({
    toolId: "composer",
    listEl: document.getElementById("cmpSavedList"),
    getEntry: () => {
      if (!cmpState.result) return null;
      const first = (cmpState.values.outcome || "Untitled").trim().slice(0, 52);
      return { name: first, meta: cmpState.result.typeLabel, payload: { type: cmpState.type, values: cmpState.values, result: cmpState.result } };
    },
    applyEntry: (p) => {
      cmpState = { type: p.type, values: p.values, result: p.result };
      document.getElementById("cmpType").value = p.type;
      cmpRenderFields();
      cmpRenderOut();
      wsSet("draft_composer", cmpState);
    },
  });
  document.getElementById("cmpSave").addEventListener("click", saveable.save);
}

/* ---------------------------------------------------- Tool 2: Scope Splitter */

const SPL_PHASES = [
  { key: "research",  title: "Research & validation",   verb: "Research and validate the ground this project stands on:" },
  { key: "strategy",  title: "Positioning & strategy",  verb: "Lock the positioning and strategy for:" },
  { key: "build",     title: "Build the core assets",   verb: "Build the core deliverables for:" },
  { key: "assemble",  title: "Assemble & review",       verb: "Assemble everything into one reviewed, consistent package for:" },
];

/** Weighted breadth score deciding one boardroom or several.
 *  deliverables × dependency depth × audience spread × research-first. */
function computeSplit({ description, deliverables, dependency, audiences, researchFirst }) {
  const d = Math.max(1, Number(deliverables) || 1);
  const a = Math.max(1, Number(audiences) || 1);

  let deliverableScore;
  if (d <= 2) deliverableScore = 0;
  else if (d <= 5) deliverableScore = 2;
  else if (d <= 9) deliverableScore = 4;
  else deliverableScore = 6;

  const depScore = dependency === "heavy" ? 3 : dependency === "light" ? 1 : 0;
  const audienceScore = Math.min(4, (a - 1) * 2);
  const researchScore = researchFirst ? 2 : 0;
  const score = deliverableScore + depScore + audienceScore + researchScore;

  let boardrooms;
  if (score <= 3) boardrooms = 1;
  else if (score <= 7) boardrooms = 2;
  else if (score <= 11) boardrooms = 3;
  else boardrooms = 4;

  const desc = (description || "this project").trim() || "this project";

  // One boardroom means one all-in command, not the first phase of a sequence.
  let chosen;
  if (boardrooms === 1) {
    chosen = [{ key: "single", title: "Single boardroom", verb: "Run this as one boardroom, start to finish:" }];
  } else {
    // Research-first projects lead with research; everything else starts at strategy.
    const pool = researchFirst ? SPL_PHASES.slice() : SPL_PHASES.filter((p) => p.key !== "research");
    boardrooms = Math.min(boardrooms, pool.length); // never promise more phases than exist
    chosen = pool.slice(0, boardrooms);
    if (chosen[chosen.length - 1].key !== "assemble") chosen[chosen.length - 1] = SPL_PHASES[3];
  }

  const phases = chosen.map((p, i) => ({
    key: p.key,
    title: p.title,
    command: joinParts([
      p.verb,
      desc + ".",
      i === 0 ? "" : "Build on what the previous boardroom produced — I'll paste it in.",
      "Deliver only this phase, finished, and stop there.",
    ]),
  }));

  const warning = boardrooms === 1
    ? ""
    : "Run these in order and paste each finished result into the next command. One giant command across " + d + " deliverables tends to drift by the end.";

  return { score, boardrooms, phases, warning, breakdown: { deliverableScore, depScore, audienceScore, researchScore } };
}

let splState = { result: null };

function splReadInputs() {
  return {
    description: document.getElementById("splDesc").value,
    deliverables: document.getElementById("splCount").value,
    dependency: document.getElementById("splDep").value,
    audiences: document.getElementById("splAud").value,
    researchFirst: document.getElementById("splResearch").checked,
  };
}

function splRenderOut() {
  const host = document.getElementById("splOut");
  const r = splState.result;
  if (!r) { host.innerHTML = '<p class="output-placeholder">Describe the project and press Compute Split.</p>'; return; }
  const b = r.breakdown;
  let html = `<div class="metric-row">
    <div class="metric"><div class="metric-value">${r.score}</div><div class="metric-label">Breadth score</div></div>
    <div class="metric"><div class="metric-value">${r.boardrooms}</div><div class="metric-label">Boardroom${r.boardrooms === 1 ? "" : "s"}</div></div>
  </div>`;
  html += `<div class="out-section"><h3>How that score was built</h3><ul class="out-list">
    <li>Deliverable count: <strong>+${b.deliverableScore}</strong></li>
    <li>Dependency depth: <strong>+${b.depScore}</strong></li>
    <li>Audience spread: <strong>+${b.audienceScore}</strong></li>
    <li>Research needed first: <strong>+${b.researchScore}</strong></li>
  </ul></div>`;
  if (r.warning) html += `<div class="out-section"><p class="out-p">${escapeHtml(r.warning)}</p></div>`;
  html += `<div class="out-section"><h3>${r.boardrooms === 1 ? "Your single command" : "Run these in this order"}</h3>` +
    r.phases.map((p, i) => `<div style="margin-bottom:14px"><div class="criterion-name" style="margin-bottom:6px">${r.boardrooms > 1 ? (i + 1) + ". " : ""}${escapeHtml(p.title)}</div><div class="cmd-block">${escapeHtml(p.command)}</div></div>`).join("") +
    `</div>`;
  host.innerHTML = html;
}

function initSplitter() {
  const savedDesc = wsGet("draft_splitter_desc", "");
  if (savedDesc) document.getElementById("splDesc").value = savedDesc;
  const draft = wsGet("draft_splitter", null);
  if (draft) {
    document.getElementById("splDesc").value = draft.inputs.description || "";
    document.getElementById("splCount").value = draft.inputs.deliverables;
    document.getElementById("splDep").value = draft.inputs.dependency;
    document.getElementById("splAud").value = draft.inputs.audiences;
    document.getElementById("splResearch").checked = !!draft.inputs.researchFirst;
    splState.result = draft.result;
  }
  splRenderOut();

  document.getElementById("splPull").addEventListener("click", () => {
    const d = wsGet("draft_composer", null);
    const outcome = d && d.values ? (d.values.outcome || "") : "";
    if (!outcome) { showToast("Nothing in Composer yet"); return; }
    document.getElementById("splDesc").value = outcome;
    showToast("Pulled from Composer");
  });

  document.getElementById("splRun").addEventListener("click", () => {
    const inputs = splReadInputs();
    splState.result = computeSplit(inputs);
    wsSet("draft_splitter", { inputs, result: splState.result });
    splRenderOut();
  });

  document.getElementById("splClear").addEventListener("click", () => {
    document.getElementById("splDesc").value = "";
    document.getElementById("splCount").value = 3;
    document.getElementById("splDep").value = "none";
    document.getElementById("splAud").value = 1;
    document.getElementById("splResearch").checked = false;
    splState.result = null;
    wsSet("draft_splitter", null);
    splRenderOut();
    showToast("Cleared");
  });

  document.getElementById("splCopy").addEventListener("click", () => {
    if (!splState.result) { showToast("Nothing to copy yet"); return; }
    copyText(splState.result.phases.map((p, i) => (splState.result.boardrooms > 1 ? (i + 1) + ". " + p.title + "\n" : "") + p.command).join("\n\n"));
  });

  const saveable = initSaveable({
    toolId: "splitter",
    listEl: document.getElementById("splSavedList"),
    getEntry: () => {
      if (!splState.result) return null;
      const inputs = splReadInputs();
      const name = (inputs.description || "Untitled split").trim().slice(0, 52);
      return { name, meta: splState.result.boardrooms + " boardroom" + (splState.result.boardrooms === 1 ? "" : "s") + " · score " + splState.result.score, payload: { inputs, result: splState.result } };
    },
    applyEntry: (p) => {
      document.getElementById("splDesc").value = p.inputs.description || "";
      document.getElementById("splCount").value = p.inputs.deliverables;
      document.getElementById("splDep").value = p.inputs.dependency;
      document.getElementById("splAud").value = p.inputs.audiences;
      document.getElementById("splResearch").checked = !!p.inputs.researchFirst;
      splState.result = p.result;
      wsSet("draft_splitter", p);
      splRenderOut();
    },
  });
  document.getElementById("splSave").addEventListener("click", saveable.save);
}

/* ----------------------------------------------- Tool 3: Blank-Screen Breaker */

const BRK_STUCK = [
  { id: "leads",       label: "No steady flow of leads" },
  { id: "offer",       label: "The offer isn't converting" },
  { id: "copy",        label: "Copy and messaging" },
  { id: "pricing",     label: "Pricing — what to charge" },
  { id: "launch",      label: "Getting a launch out the door" },
  { id: "competition", label: "Losing deals to competitors" },
  { id: "delivery",    label: "Delivery takes too long" },
  { id: "direction",   label: "Not sure what to focus on at all" },
];

const BRK_MISSIONS = [
  { id: "ad-angles",        title: "Split-test ad angles",            impact: 3, effort: 4,  speed: 7,  stuck: ["leads", "copy"],                     triedTerms: ["ads", "ad", "facebook ads", "paid ads", "ppc"], ask: "Create ad creatives for {sells}, with distinct angles I can split test." },
  { id: "client-research",  title: "Research and pitch 10 prospects", impact: 5, effort: 6,  speed: 14, stuck: ["leads"],                             triedTerms: ["prospecting", "prospect research", "lead lists"], ask: "Find me ten qualified {audience} I could sign, and prepare everything I need to win them." },
  { id: "competitor-gap",   title: "Break down competitors, find the gap", impact: 3, effort: 3, speed: 7, stuck: ["competition", "direction"],       triedTerms: ["competitor research", "competitor analysis"], ask: "Break down my three biggest competitors in {sells} and find the gap I can own." },
  { id: "content-month",    title: "A month of content, one campaign",impact: 3, effort: 6,  speed: 30, stuck: ["leads", "copy"],                     triedTerms: ["content", "content marketing", "blogging", "social"], ask: "Give me a month of content for {audience} that all points back to one campaign for {sells}." },
  { id: "decision-case",    title: "Business case, argued both ways", impact: 3, effort: 2,  speed: 7,  stuck: ["direction"],                         triedTerms: ["business case"], ask: "Build the business case for my next move with {sells} — and argue against it too." },
  { id: "delivery-system",  title: "Design a repeatable delivery system", impact: 4, effort: 7, speed: 30, stuck: ["delivery"],                       triedTerms: ["sops", "systemising", "systematizing"], ask: "Design a repeatable delivery system for {sells} so each new client costs me less time than the last." },
  { id: "email-sequence",   title: "Full email sequence for the offer",impact: 4, effort: 5,  speed: 10, stuck: ["copy", "launch"],                    triedTerms: ["email", "email marketing", "newsletter"], ask: "Write the full email sequence for {sells}, written for {audience}." },
  { id: "funnel-audit",     title: "Audit the funnel for drop-off",   impact: 4, effort: 3,  speed: 7,  stuck: ["offer", "leads"],                    triedTerms: ["funnel audit", "cro"], ask: "Audit my funnel for {sells} and tell me where I'm actually losing {audience}." },
  { id: "launch-plan",      title: "Plan and build a complete launch",impact: 5, effort: 12, speed: 30, stuck: ["launch"],                            triedTerms: ["launch", "launching"], ask: "Plan and build the complete launch for {sells}, from research through to promotional assets." },
  { id: "offer-rebuild",    title: "Rebuild the offer around the outcome", impact: 5, effort: 4, speed: 7, stuck: ["offer", "pricing"],               triedTerms: ["offer", "repositioning the offer"], ask: "Turn {sells} into an offer {audience} will actually pay for — rebuild it around the outcome, not the feature list." },
  { id: "outreach-campaign",title: "Outreach campaign for one client type", impact: 4, effort: 5, speed: 14, stuck: ["leads"],                        triedTerms: ["cold email", "outreach", "cold calling", "dms"], ask: "Prepare an outreach campaign targeting {audience}, with the research behind each message." },
  { id: "positioning",      title: "Find the unused positioning angle",impact: 4, effort: 3,  speed: 7,  stuck: ["competition", "offer", "direction"],triedTerms: ["positioning", "messaging"], ask: "Find me a positioning angle for {sells} that my competitors aren't using." },
  { id: "sales-page",       title: "Sales page copy, start to finish",impact: 4, effort: 6,  speed: 14, stuck: ["copy", "offer"],                     triedTerms: ["sales page", "landing page", "copywriting"], ask: "Write the sales page copy for {sells}, aimed at {audience}." },
  { id: "service-productize",title: "Productize the service",         impact: 5, effort: 8,  speed: 30, stuck: ["pricing", "delivery", "direction"],  triedTerms: ["productizing", "packaging", "fixed pricing"], ask: "Turn {sells} into a productized offer with fixed scope and fixed pricing for {audience}." },
];

/** Scores every mission on impact, stuck-match, readiness (hours vs effort),
 *  horizon fit and effort cost. Deterministic, with an explicit tie-break so
 *  equal scores never depend on array order alone. */
function computeMissionRanking({ sells, audience, stuck, horizon, hours, tried }) {
  const h = Math.max(1, Number(hours) || 1);
  const hz = Number(horizon) || 90;
  const sellsTxt = (sells || "").trim() || "my offer";
  const audienceTxt = (audience || "").trim() || "my audience";
  const triedList = (tried || "").toLowerCase();

  const scored = BRK_MISSIONS.map((m) => {
    const impactPts = m.impact * 10;
    const stuckPts = m.stuck.indexOf(stuck) !== -1 ? 25 : 0;
    const readinessPts = h >= m.effort ? 15 : (h * 2 >= m.effort ? 5 : -10);
    const horizonPts = m.speed <= hz ? 10 : -5;
    const effortPts = -m.effort;
    const triedPts = triedList && (m.triedTerms || []).some((t) => triedList.indexOf(t) !== -1) ? -8 : 0;
    const score = impactPts + stuckPts + readinessPts + horizonPts + effortPts + triedPts;
    return {
      id: m.id,
      title: m.title,
      score,
      impact: m.impact,
      effort: m.effort,
      speed: m.speed,
      matched: stuckPts > 0,
      parts: { impactPts, stuckPts, readinessPts, horizonPts, effortPts, triedPts },
      command: m.ask.split("{sells}").join(sellsTxt).split("{audience}").join(audienceTxt),
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.impact !== a.impact) return b.impact - a.impact;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return { missions: scored.slice(0, 6), all: scored };
}

let brkState = { result: null };

function brkReadInputs() {
  return {
    sells: document.getElementById("brkSells").value,
    audience: document.getElementById("brkAudience").value,
    stuck: document.getElementById("brkStuck").value,
    horizon: document.getElementById("brkHorizon").value,
    hours: document.getElementById("brkHours").value,
    tried: document.getElementById("brkTried").value,
  };
}

function brkRenderOut() {
  const host = document.getElementById("brkOut");
  const r = brkState.result;
  if (!r) { host.innerHTML = '<p class="output-placeholder">Answer the questions and press Rank My Missions.</p>'; return; }
  host.innerHTML = r.missions.map((m, i) => `
    <div class="finding">
      <div class="finding-head">
        <span class="finding-title">${i + 1}. ${escapeHtml(m.title)}</span>
        ${m.matched ? '<span class="pill pill-ok">Hits your blocker</span>' : ""}
        <span class="criterion-weight">score ${m.score}</span>
      </div>
      <p class="finding-why">Impact +${m.parts.impactPts} · blocker match +${m.parts.stuckPts} · readiness ${m.parts.readinessPts >= 0 ? "+" : ""}${m.parts.readinessPts} · horizon fit ${m.parts.horizonPts >= 0 ? "+" : ""}${m.parts.horizonPts} · effort ${m.parts.effortPts}${m.parts.triedPts ? " · already tried " + m.parts.triedPts : ""} — roughly ${m.effort}h of your time.</p>
      <div class="cmd-block">${escapeHtml(m.command)}</div>
      <div class="btn-row"><button class="ghost-btn" data-send="${escapeHtml(m.id)}" type="button">Send to Composer</button></div>
    </div>`).join("");

  host.querySelectorAll("button[data-send]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = r.missions.find((x) => x.id === btn.dataset.send);
      if (!m) return;
      const inputs = brkReadInputs();
      cmpState = {
        type: m.id === "launch-plan" ? "launch" : m.id === "sales-page" || m.id === "email-sequence" || m.id === "ad-angles" || m.id === "content-month" ? "copy"
             : m.id === "competitor-gap" || m.id === "funnel-audit" ? "research"
             : m.id === "decision-case" ? "decision"
             : m.id === "client-research" || m.id === "outreach-campaign" ? "pitch" : "copy",
        values: { outcome: m.command, business: inputs.sells, audience: inputs.audience },
        result: null,
      };
      wsSet("draft_composer", cmpState);
      document.getElementById("cmpType").value = cmpState.type;
      cmpRenderFields();
      cmpRenderOut();
      goTo("brief", "composer");
      showToast("Sent to Composer");
    });
  });
}

function initBreaker() {
  const sel = document.getElementById("brkStuck");
  sel.innerHTML = BRK_STUCK.map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join("");

  const profile = getProfile();
  if (profile.sells) document.getElementById("brkSells").value = profile.sells;
  if (profile.audience) document.getElementById("brkAudience").value = profile.audience;

  const draft = wsGet("draft_breaker", null);
  if (draft) {
    document.getElementById("brkSells").value = draft.inputs.sells || "";
    document.getElementById("brkAudience").value = draft.inputs.audience || "";
    document.getElementById("brkStuck").value = draft.inputs.stuck;
    document.getElementById("brkHorizon").value = draft.inputs.horizon;
    document.getElementById("brkHours").value = draft.inputs.hours;
    document.getElementById("brkTried").value = draft.inputs.tried || "";
    brkState.result = draft.result;
  }
  brkRenderOut();

  document.getElementById("brkRun").addEventListener("click", () => {
    const inputs = brkReadInputs();
    brkState.result = computeMissionRanking(inputs);
    wsSet("draft_breaker", { inputs, result: brkState.result });
    brkRenderOut();
  });

  document.getElementById("brkClear").addEventListener("click", () => {
    ["brkSells", "brkAudience", "brkTried"].forEach((id) => { document.getElementById(id).value = ""; });
    document.getElementById("brkStuck").selectedIndex = 0;
    document.getElementById("brkHorizon").value = "90";
    document.getElementById("brkHours").value = 10;
    brkState.result = null;
    wsSet("draft_breaker", null);
    brkRenderOut();
    showToast("Cleared");
  });

  document.getElementById("brkCopy").addEventListener("click", () => {
    if (!brkState.result) { showToast("Nothing to copy yet"); return; }
    copyText(brkState.result.missions.map((m, i) => (i + 1) + ". " + m.title + " (score " + m.score + ")\n" + m.command).join("\n\n"));
  });

  const saveable = initSaveable({
    toolId: "breaker",
    listEl: document.getElementById("brkSavedList"),
    getEntry: () => {
      if (!brkState.result) return null;
      const inputs = brkReadInputs();
      const stuckLabel = (BRK_STUCK.find((s) => s.id === inputs.stuck) || {}).label || inputs.stuck;
      return { name: (inputs.sells || "My business").trim().slice(0, 52) + " — ranked missions", meta: stuckLabel, payload: { inputs, result: brkState.result } };
    },
    applyEntry: (p) => {
      document.getElementById("brkSells").value = p.inputs.sells || "";
      document.getElementById("brkAudience").value = p.inputs.audience || "";
      document.getElementById("brkStuck").value = p.inputs.stuck;
      document.getElementById("brkHorizon").value = p.inputs.horizon;
      document.getElementById("brkHours").value = p.inputs.hours;
      document.getElementById("brkTried").value = p.inputs.tried || "";
      brkState.result = p.result;
      wsSet("draft_breaker", p);
      brkRenderOut();
    },
  });
  document.getElementById("brkSave").addEventListener("click", saveable.save);
}

/* ==========================================================================
   MODULE 2 — VERDICT
   ========================================================================== */

/* ------------------------------------------------ Tool 4: Deliverable Scorecard */

const SC_ASSETS = [
  { id: "vsl", label: "VSL script", criteria: [
    { id: "coldframe", name: "Cold-traffic framing", weight: 5, note: "Would someone who's never heard of you follow it, or does it assume prior knowledge?" },
    { id: "hook",      name: "Hook earns the first 30 seconds", weight: 4, note: "Does the opening give a reason to keep watching before any pitch?" },
    { id: "proof",     name: "Proof behind every claim", weight: 4, note: "Is each promise backed by something, or just asserted louder?" },
    { id: "oneidea",   name: "One controlling idea", weight: 3, note: "Does it stay on one argument, or wander between three?" },
    { id: "aloud",     name: "Written to be read aloud", weight: 3, note: "Read a paragraph out loud. Does it survive it?" },
  ]},
  { id: "emails", label: "Email sequence", criteria: [
    { id: "order",     name: "Send order matches the buying decision", weight: 5, note: "Does trust get built before the ask, or does it open on urgency?" },
    { id: "valuefirst",name: "Value before the ask", weight: 4, note: "Would the early emails be worth opening if nothing was for sale?" },
    { id: "distinct",  name: "Each email earns its own send", weight: 4, note: "Could any two be merged with nothing lost?" },
    { id: "subject",   name: "Subject lines survive a full inbox", weight: 3, note: "Do they work without the preview text carrying them?" },
    { id: "dates",     name: "Dates and deadlines are consistent", weight: 3, note: "Do the cart dates match across every send?" },
  ]},
  { id: "positioning", label: "Positioning statement", criteria: [
    { id: "specific",  name: "Names a specific buyer", weight: 5, note: "Is there a real person in it, or does it say 'businesses'?" },
    { id: "enemy",     name: "Names what it's against", weight: 4, note: "Strong positioning has an enemy. Is one visible?" },
    { id: "saturation",name: "Not the category default angle", weight: 4, note: "Are your competitors already running this exact angle?" },
    { id: "provable",  name: "Provable, not just asserted", weight: 3, note: "Could you defend it with evidence in a sales call?" },
    { id: "compress",  name: "Survives compression to one sentence", weight: 3, note: "Can you say it in one breath without losing it?" },
  ]},
  { id: "offer", label: "Offer structure", criteria: [
    { id: "outcome",   name: "Built around the outcome, not the module count", weight: 5, note: "Does it lead with what the buyer gets, or with how much stuff there is?" },
    { id: "pricelogic",name: "The price is justified by the structure", weight: 4, note: "Does the shape of the offer explain the number?" },
    { id: "risk",      name: "Risk reversal is real", weight: 4, note: "Is the guarantee meaningful, or decorative?" },
    { id: "stackorder",name: "Order makes the yes obvious", weight: 3, note: "Does each element remove an objection in sequence?" },
    { id: "scope",     name: "Scope is something you can actually deliver", weight: 3, note: "Could you fulfil this at volume without drowning?" },
  ]},
  { id: "research", label: "Research summary", criteria: [
    { id: "sourced",   name: "Claims are sourced, not asserted", weight: 5, note: "Can you trace each finding to something checkable?" },
    { id: "actionable",name: "Ends in a recommendation", weight: 4, note: "Does it decide something, or just survey the field?" },
    { id: "contrary",  name: "Includes what argues against the plan", weight: 4, note: "Research that only agrees with you isn't research." },
    { id: "recency",   name: "Current, not general knowledge", weight: 3, note: "Could this have been written three years ago unchanged?" },
    { id: "scopefit",  name: "Answers the question you asked", weight: 3, note: "Did it drift into an adjacent question that was easier?" },
  ]},
  { id: "ads", label: "Ad angles", criteria: [
    { id: "distinct",  name: "Angles are genuinely different", weight: 5, note: "Or are they the same claim reworded five ways?" },
    { id: "claimsafe", name: "Claims survive a compliance read", weight: 4, note: "Run it through Claim Auditor before you spend." },
    { id: "hookfirst", name: "Hook works without the image", weight: 4, note: "Does the text stand alone if the creative is weak?" },
    { id: "audiencefit",name: "Written for the audience, not the product", weight: 3, note: "Does it open on their problem or your feature?" },
    { id: "testable",  name: "Testable one variable at a time", weight: 3, note: "Could you tell which change caused the result?" },
  ]},
  { id: "proposal", label: "Client proposal", criteria: [
    { id: "theirwords",name: "Uses the client's own words for the problem", weight: 5, note: "Does it sound like you listened, or like a template?" },
    { id: "scopeclear",name: "Scope boundaries are explicit", weight: 4, note: "Is it obvious what is not included?" },
    { id: "anchored",  name: "Price anchored against their cost of inaction", weight: 4, note: "Is the number compared to something, or floating alone?" },
    { id: "nextstep",  name: "One obvious next step", weight: 3, note: "Is there exactly one thing for them to do?" },
    { id: "countable", name: "Deliverables are countable", weight: 3, note: "Could you both agree on when it's finished?" },
  ]},
  { id: "code", label: "Technical build", criteria: [
    { id: "runs",      name: "It runs as delivered", weight: 5, note: "Did you actually execute it, or read it and assume?" },
    { id: "edge",      name: "Handles the failure cases", weight: 4, note: "What happens on bad input, no network, empty state?" },
    { id: "deps",      name: "No unexplained dependencies or keys", weight: 4, note: "Does it quietly need something you don't have?" },
    { id: "handover",  name: "You could hand it to someone else", weight: 3, note: "Would a second developer understand it unaided?" },
    { id: "proven",    name: "Something proves it works", weight: 3, note: "A test, a demo run, a screenshot — anything but 'looks right'." },
  ]},
];

const SC_LEVELS = [
  { v: 0, label: "Missing" },
  { v: 1, label: "Weak" },
  { v: 2, label: "Okay" },
  { v: 3, label: "Strong" },
];

/** Weighted rubric → percentage → ship / fix first / send back.
 *  Weakest criteria are those rated 0 or 1, ranked by weight. */
function computeScorecard(assetId, scores) {
  const asset = SC_ASSETS.find((a) => a.id === assetId) || SC_ASSETS[0];
  let earned = 0;
  let possible = 0;
  asset.criteria.forEach((c) => {
    const s = Math.max(0, Math.min(3, Number(scores[c.id]) || 0));
    earned += s * c.weight;
    possible += 3 * c.weight;
  });
  const pct = Math.round((earned / possible) * 100);

  let verdict, verdictClass, verdictSub;
  if (pct >= 80) {
    verdict = "Ship it";
    verdictClass = "v-ship";
    verdictSub = "Strong enough to use. Anything below Strong is a polish pass, not a rebuild.";
  } else if (pct >= 55) {
    verdict = "Fix these first";
    verdictClass = "v-fix";
    verdictSub = "Usable underneath, but not yet. Fix the items below before this goes anywhere.";
  } else {
    verdict = "Send it back";
    verdictClass = "v-back";
    verdictSub = "Too much is missing to patch by hand. Send it back to the boardroom with the command below.";
  }

  const weakest = asset.criteria
    .map((c) => ({ ...c, score: Math.max(0, Math.min(3, Number(scores[c.id]) || 0)) }))
    .filter((c) => c.score <= 1)
    .sort((a, b) => (b.weight - a.weight) || (a.score - b.score) || (a.id < b.id ? -1 : 1));

  const followUpCommand = weakest.length
    ? joinParts([
        "Send this " + asset.label.toLowerCase() + " back for revision.",
        "These specific things are wrong:",
        weakest.map((c, i) => (i + 1) + ") " + c.name + " — " + c.note).join(" "),
        "Rewrite only those parts. Keep everything that already works exactly as it is, and have the reviewer confirm each point before delivering.",
      ])
    : "";

  return { pct, verdict, verdictClass, verdictSub, weakest, followUpCommand, assetLabel: asset.label, assetId: asset.id, earned, possible };
}

let scState = { asset: "vsl", scores: {}, result: null };

function scRenderCriteria() {
  const asset = SC_ASSETS.find((a) => a.id === scState.asset);
  const host = document.getElementById("scCriteria");
  host.innerHTML = asset.criteria.map((c) => {
    const cur = scState.scores[c.id] == null ? 2 : Number(scState.scores[c.id]);
    return `<div class="criterion">
      <div class="criterion-head"><span class="criterion-name">${escapeHtml(c.name)}</span><span class="criterion-weight">weight ${c.weight}</span></div>
      <p class="criterion-note">${escapeHtml(c.note)}</p>
      <div class="segmented" data-crit="${escapeHtml(c.id)}">
        ${SC_LEVELS.map((l) => `<button type="button" class="seg-btn${l.v === cur ? " is-active" : ""}" data-val="${l.v}">${l.label}</button>`).join("")}
      </div>
    </div>`;
  }).join("");

  asset.criteria.forEach((c) => { if (scState.scores[c.id] == null) scState.scores[c.id] = 2; });

  host.querySelectorAll(".segmented").forEach((seg) => {
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      seg.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      scState.scores[seg.dataset.crit] = Number(btn.dataset.val);
      wsSet("draft_scorecard", scState);
    });
  });
}

function scRenderOut() {
  const host = document.getElementById("scOut");
  const r = scState.result;
  if (!r) { host.innerHTML = '<p class="output-placeholder">Pick a deliverable type, rate each criterion, then press Score It.</p>'; return; }
  let html = `<div class="verdict-banner ${r.verdictClass}"><div class="v-title">${escapeHtml(r.verdict)} — ${r.pct}%</div><div class="v-sub">${escapeHtml(r.verdictSub)}</div></div>`;
  html += `<div class="metric-row">
    <div class="metric"><div class="metric-value">${r.pct}%</div><div class="metric-label">Weighted score</div></div>
    <div class="metric"><div class="metric-value">${r.earned}/${r.possible}</div><div class="metric-label">Points</div></div>
    <div class="metric"><div class="metric-value">${r.weakest.length}</div><div class="metric-label">Weak spots</div></div>
  </div>`;
  if (r.weakest.length) {
    html += `<div class="out-section"><h3>Fix in this order</h3><ul class="out-list">` +
      r.weakest.map((c) => `<li><strong>${escapeHtml(c.name)}</strong> (weight ${c.weight}, rated ${escapeHtml(SC_LEVELS[c.score].label)}) — ${escapeHtml(c.note)}</li>`).join("") +
      `</ul></div>`;
    html += `<div class="out-section"><h3>Send-Back Command</h3><div class="cmd-block">${escapeHtml(r.followUpCommand)}</div></div>`;
  } else {
    html += `<div class="out-section"><p class="out-p">Nothing rated Missing or Weak. There's no send-back command because there's nothing specific to send back.</p></div>`;
  }
  host.innerHTML = html;
}

function initScorecard() {
  const sel = document.getElementById("scAsset");
  sel.innerHTML = SC_ASSETS.map((a) => `<option value="${a.id}">${escapeHtml(a.label)}</option>`).join("");

  const draft = wsGet("draft_scorecard", null);
  if (draft && draft.asset) scState = draft;
  sel.value = scState.asset;
  scRenderCriteria();
  scRenderOut();

  sel.addEventListener("change", () => {
    scState.asset = sel.value;
    scState.scores = {};
    scState.result = null;
    scRenderCriteria();
    scRenderOut();
    wsSet("draft_scorecard", scState);
  });

  document.getElementById("scRun").addEventListener("click", () => {
    scState.result = computeScorecard(scState.asset, scState.scores);
    wsSet("draft_scorecard", scState);
    // Ship Tracker reads these — a "send it back" blocks marking that asset live.
    const verdicts = wsGet("asset_verdicts", {});
    verdicts[scState.asset] = { verdict: scState.result.verdict, pct: scState.result.pct, at: new Date().toISOString() };
    wsSet("asset_verdicts", verdicts);
    scRenderOut();
  });

  document.getElementById("scClear").addEventListener("click", () => {
    scState.scores = {};
    scState.result = null;
    scRenderCriteria();
    scRenderOut();
    wsSet("draft_scorecard", scState);
    showToast("Reset");
  });

  document.getElementById("scCopy").addEventListener("click", () => {
    if (!scState.result) { showToast("Nothing to copy yet"); return; }
    const r = scState.result;
    copyText(joinParts([r.assetLabel + ": " + r.verdict + " (" + r.pct + "%)."]) +
      (r.weakest.length ? "\n\nFix first:\n" + r.weakest.map((c) => "- " + c.name).join("\n") + "\n\n" + r.followUpCommand : ""));
  });

  const saveable = initSaveable({
    toolId: "scorecard",
    listEl: document.getElementById("scSavedList"),
    getEntry: () => {
      if (!scState.result) return null;
      return { name: scState.result.assetLabel + " — " + scState.result.verdict, meta: scState.result.pct + "% · " + scState.result.weakest.length + " weak spot" + (scState.result.weakest.length === 1 ? "" : "s"), payload: { asset: scState.asset, scores: scState.scores, result: scState.result } };
    },
    applyEntry: (p) => {
      scState = { asset: p.asset, scores: p.scores, result: p.result };
      document.getElementById("scAsset").value = p.asset;
      scRenderCriteria();
      scRenderOut();
      wsSet("draft_scorecard", scState);
    },
  });
  document.getElementById("scSave").addEventListener("click", saveable.save);
}

/* --------------------------------------------------- Tool 5: Claim Auditor */

const CLAIM_RULES = [
  { id: "earnings-rate", label: "Earnings rate claim", severity: "high",
    re: /\$\s?[\d,]+(?:\.\d+)?\+?\s*(?:\/|per\s+|a\s+)\s*(?:day|week|month|year|hour|sale|client)\b/gi,
    why: "A specific income figure tied to a time period is treated as an earnings claim. It needs substantiation and, in most cases, a typicality disclaimer.",
    fix: "State what the tool or method does, not what income it produces. If you keep a figure, attach the real average and say it isn't typical." },
  { id: "earnings-verb", label: "Income claim", severity: "high",
    re: /\b(?:make|makes|making|made|earn|earns|earned|earning|bank|banked|pull(?:ed|ing)?\s+in)\s+(?:up\s+to\s+)?\$\s?[\d,]+/gi,
    why: "Promising a dollar outcome from using something is the single most-challenged claim type in this niche.",
    fix: "Replace the outcome promise with a capability statement: what it lets someone do, not what they will earn." },
  { id: "testimonial-figure", label: "Testimonial with a figure", severity: "high",
    re: /\b(?:I|he|she|they|we)\s+(?:made|earned|generated|banked|pulled\s+in)\s+\$\s?[\d,]+/gi,
    why: "A results testimonial carrying a number requires the result to be genuine, documented, and accompanied by what a typical user can expect.",
    fix: "Keep it only if you can produce the receipts, and pair it with the typical result. Otherwise cut the number." },
  { id: "guarantee", label: "Guarantee language", severity: "high",
    re: /\b(?:guarantee[sd]?|guaranteed|risk[-\s]?free|no[-\s]?risk|zero[-\s]?risk)\b/gi,
    why: "'Guaranteed' and 'risk-free' are enforceable promises. If the only guarantee is a refund policy, saying 'risk-free' overstates it.",
    fix: "Name the actual guarantee: '30-day money-back guarantee' rather than 'risk-free'." },
  { id: "medical", label: "Health or body claim", severity: "high",
    re: /\b(?:cures?|cured|heals?|healed|treats?|treated|diagnos\w+|lose\s+\d+\s*(?:lbs?|pounds|kgs?|kilos)|weight\s+loss)\b/gi,
    why: "Health, treatment and body-composition claims are held to a far higher evidentiary standard than marketing claims.",
    fix: "Remove it, or restrict the copy to describing the product without implying a health outcome." },
  { id: "absolute", label: "Absolute claim", severity: "medium",
    re: /\b(?:always\s+works|never\s+fails|works\s+every\s+time|everyone|anyone\s+can|no\s+one\s+ever|100%\s+of)\b/gi,
    why: "Absolutes are trivially disproved by one counter-example, which makes them the easiest claims to challenge.",
    fix: "Qualify it: 'most people', 'in our testing', 'designed to'." },
  { id: "overnight", label: "Speed or effortlessness claim", severity: "medium",
    re: /\b(?:overnight|instantly|in\s+(?:just\s+)?\d+\s*(?:seconds|minutes|hours)|push[-\s]?button|set\s+(?:it\s+)?and\s+forget|on\s+autopilot|while\s+you\s+sleep)\b/gi,
    why: "Speed-and-no-effort framing implies a result without work, which regulators read as an implied earnings or outcome claim.",
    fix: "Describe the time the tool takes, not the time the result takes: 'generates the draft in under a minute'." },
  { id: "scarcity", label: "Scarcity claim", severity: "medium",
    re: /\b(?:only\s+\d+\s+(?:left|copies|spots|seats|licen[cs]es)|last\s+chance|expires?\s+(?:in|today|tonight)|closing\s+(?:soon|tonight)|before\s+(?:it'?s|its)\s+gone)\b/gi,
    why: "Scarcity is fine when it's true. A countdown that resets, or a limit that never binds, is a misrepresentation.",
    fix: "Keep it only if the limit is real and enforced. If the cart genuinely closes, say the date." },
  { id: "noeffort", label: "No-work claim", severity: "low",
    re: /\b(?:no\s+(?:work|effort|experience|skills?|tech\s+skills?)\s+(?:required|needed)|zero\s+(?:work|effort|experience)|without\s+lifting\s+a\s+finger)\b/gi,
    why: "Mild on its own, but it compounds an earnings claim elsewhere in the same piece into an implied 'money for nothing' promise.",
    fix: "Say what specifically isn't required: 'no coding required' is checkable; 'no work required' isn't." },
  { id: "superlative", label: "Unverifiable superlative", severity: "low",
    re: /\b(?:#1|world['’]?s\s+(?:best|first|only|leading)|revolutionary|breakthrough|the\s+only\s+(?:tool|app|system)\s+that)\b/gi,
    why: "Superlatives invite a 'prove it' from a platform reviewer or a competitor, and rarely add conversion.",
    fix: "Swap for something specific and true: what it does that the alternatives don't." },
];

const SEV_RANK = { high: 0, medium: 1, low: 2 };

/** Scans copy for risky claim patterns. Returns findings deduped per
 *  (rule, matched text), a severity tally, and an overall risk level.
 *  Clean copy legitimately returns zero findings — that's the default path. */
function computeClaimAudit(text) {
  const src = String(text || "");
  const findings = [];
  const seen = {};

  CLAIM_RULES.forEach((rule) => {
    const re = new RegExp(rule.re.source, rule.re.flags);
    let m;
    while ((m = re.exec(src)) !== null) {
      if (m[0] === "") { re.lastIndex++; continue; }
      const key = rule.id + "::" + m[0].toLowerCase();
      if (seen[key]) { seen[key].occurrences += 1; continue; }
      const f = { ruleId: rule.id, label: rule.label, severity: rule.severity, match: m[0], index: m.index, why: rule.why, fix: rule.fix, occurrences: 1 };
      seen[key] = f;
      findings.push(f);
    }
  });

  findings.sort((a, b) => (SEV_RANK[a.severity] - SEV_RANK[b.severity]) || (a.index - b.index));

  const counts = { high: 0, medium: 0, low: 0 };
  findings.forEach((f) => { counts[f.severity] += f.occurrences; });
  const riskScore = counts.high * 3 + counts.medium * 2 + counts.low * 1;

  let riskLevel;
  if (riskScore === 0) riskLevel = "Clean";
  else if (riskScore <= 3) riskLevel = "Low";
  else if (riskScore <= 8) riskLevel = "Medium";
  else riskLevel = "High";

  return { findings, counts, riskScore, riskLevel, wordCount: (src.match(/[A-Za-z0-9'’-]+/g) || []).length };
}

let clState = { text: "", result: null };

function clRenderOut() {
  const host = document.getElementById("clOut");
  const r = clState.result;
  if (!r) { host.innerHTML = '<p class="output-placeholder">Paste your copy and press Audit Claims.</p>'; return; }
  let html = `<div class="metric-row">
    <div class="metric"><div class="metric-value">${escapeHtml(r.riskLevel)}</div><div class="metric-label">Risk level</div></div>
    <div class="metric"><div class="metric-value">${r.counts.high}</div><div class="metric-label">High</div></div>
    <div class="metric"><div class="metric-value">${r.counts.medium}</div><div class="metric-label">Medium</div></div>
    <div class="metric"><div class="metric-value">${r.counts.low}</div><div class="metric-label">Low</div></div>
  </div>`;
  if (!r.findings.length) {
    html += `<div class="verdict-banner v-ship"><div class="v-title">No flagged patterns</div><div class="v-sub">Nothing in this copy matched the patterns this tool checks for across ${r.wordCount} words. That's a clean pass on pattern-matching — it isn't a legal review, and it can't tell you whether a specific claim is substantiated.</div></div>`;
  } else {
    html += r.findings.map((f) => `
      <div class="finding">
        <div class="finding-head">
          <span class="pill pill-${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span>
          <span class="finding-title">${escapeHtml(f.label)}</span>
          ${f.occurrences > 1 ? `<span class="criterion-weight">${f.occurrences}×</span>` : ""}
        </div>
        <div class="finding-quote">${escapeHtml(f.match)}</div>
        <p class="finding-why">${escapeHtml(f.why)}</p>
        <p class="finding-fix"><strong>Safer:</strong> ${escapeHtml(f.fix)}</p>
      </div>`).join("");
    html += `<div class="out-section"><p class="out-p" style="color:var(--ink-soft)">This is a pattern check, not legal advice. It can miss things, and a flagged phrase isn't automatically a violation — context decides.</p></div>`;
  }
  host.innerHTML = html;
}

function initClaims() {
  const ta = document.getElementById("clText");
  const draft = wsGet("draft_claims", null);
  if (draft) { ta.value = draft.text || ""; clState = draft; }
  clRenderOut();

  ta.addEventListener("input", () => { clState.text = ta.value; wsSet("draft_claims", clState); });

  document.getElementById("clRun").addEventListener("click", () => {
    clState.text = ta.value;
    clState.result = computeClaimAudit(clState.text);
    wsSet("draft_claims", clState);
    clRenderOut();
  });

  document.getElementById("clClear").addEventListener("click", () => {
    ta.value = "";
    clState = { text: "", result: null };
    wsSet("draft_claims", clState);
    clRenderOut();
    showToast("Cleared");
  });

  document.getElementById("clCopy").addEventListener("click", () => {
    if (!clState.result) { showToast("Nothing to copy yet"); return; }
    const r = clState.result;
    if (!r.findings.length) { copyText("Claim audit: no flagged patterns across " + r.wordCount + " words."); return; }
    copyText("Claim audit — risk " + r.riskLevel + " (" + r.counts.high + " high, " + r.counts.medium + " medium, " + r.counts.low + " low)\n\n" +
      r.findings.map((f) => "[" + f.severity.toUpperCase() + "] " + f.label + '\n  "' + f.match + '"\n  Why: ' + f.why + "\n  Safer: " + f.fix).join("\n\n"));
  });

  const saveable = initSaveable({
    toolId: "claims",
    listEl: document.getElementById("clSavedList"),
    getEntry: () => {
      if (!clState.result) return null;
      const first = clState.text.trim().split(/\s+/).slice(0, 7).join(" ");
      return { name: (first || "Untitled copy").slice(0, 52), meta: "Risk " + clState.result.riskLevel + " · " + clState.result.findings.length + " finding" + (clState.result.findings.length === 1 ? "" : "s"), payload: { text: clState.text, result: clState.result } };
    },
    applyEntry: (p) => {
      clState = { text: p.text, result: p.result };
      document.getElementById("clText").value = p.text;
      wsSet("draft_claims", clState);
      clRenderOut();
    },
  });
  document.getElementById("clSave").addEventListener("click", saveable.save);
}

/* ---------------------------------------------- Tool 6: Voice Drift Checker */

const CTA_RE = /\b(?:click\s+here|buy\s+now|get\s+started|grab\s+(?:your|it)|sign\s+up|join\s+(?:now|us)|order\s+now|claim\s+your|book\s+a\s+call|start\s+now|get\s+instant\s+access|enrol|enroll)\b/gi;

function countSyllables(word) {
  const w = String(word).toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  let s = w.replace(/(?:es|ed)$/, "").replace(/([^l])e$/, "$1");
  const groups = s.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Reading grade + sentence metrics for one asset. Flesch–Kincaid grade level. */
function analyzeText(text) {
  const src = String(text || "").trim();
  const words = src.match(/[A-Za-z0-9'’-]+/g) || [];
  const sentenceParts = src.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const sentences = Math.max(1, sentenceParts.length);
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const wordCount = words.length;
  const avgSentenceLen = wordCount ? wordCount / sentences : 0;
  const avgSyllables = wordCount ? syllables / wordCount : 0;
  const grade = wordCount ? 0.39 * avgSentenceLen + 11.8 * avgSyllables - 15.59 : 0;
  const ctas = (src.match(CTA_RE) || []).map((c) => c.toLowerCase().replace(/\s+/g, " "));
  return {
    words: wordCount,
    sentences,
    syllables,
    avgSentenceLen: Math.round(avgSentenceLen * 10) / 10,
    grade: Math.round(grade * 10) / 10,
    ctas: Array.from(new Set(ctas)).sort(),
  };
}

const FACT_PATTERNS = [
  { id: "price",   label: "prices",      re: /\$\s?\d[\d,]*(?:\.\d{2})?/g,  norm: (s) => s.replace(/\s+/g, "") },
  { id: "percent", label: "percentages", re: /\d+(?:\.\d+)?\s?%/g,          norm: (s) => s.replace(/\s+/g, "") },
  { id: "days",    label: "day counts",  re: /\b\d+[-\s]day\b/gi,           norm: (s) => s.toLowerCase().replace(/\s+/g, "-") },
];

/** Compares 2+ assets and reports where they've drifted apart:
 *  reading grade, sentence length, CTA presence, and hard-fact mismatches. */
function computeDrift(assets) {
  const usable = assets.filter((a) => String(a.text || "").trim().length > 0);
  if (usable.length < 2) {
    return { perAsset: [], findings: [], ok: false, message: "Paste at least two assets to compare." };
  }

  const perAsset = usable.map((a) => ({ label: a.label, ...analyzeText(a.text) }));
  const findings = [];

  const grades = perAsset.map((p) => p.grade);
  const gradeSpread = Math.round((Math.max(...grades) - Math.min(...grades)) * 10) / 10;
  if (gradeSpread > 4) {
    findings.push({ type: "grade", severity: "high", detail: "Reading grade spans " + gradeSpread + " levels (" + Math.min(...grades) + " to " + Math.max(...grades) + "). These will not read as one voice." });
  } else if (gradeSpread > 2.5) {
    findings.push({ type: "grade", severity: "medium", detail: "Reading grade spans " + gradeSpread + " levels. Noticeable, worth a pass." });
  }

  const lens = perAsset.map((p) => p.avgSentenceLen);
  const lenSpread = Math.round((Math.max(...lens) - Math.min(...lens)) * 10) / 10;
  if (lenSpread > 8) {
    findings.push({ type: "sentence", severity: "high", detail: "Average sentence length ranges from " + Math.min(...lens) + " to " + Math.max(...lens) + " words — a " + lenSpread + "-word spread. One of these is written for a different reader." });
  } else if (lenSpread > 5) {
    findings.push({ type: "sentence", severity: "medium", detail: "Average sentence length varies by " + lenSpread + " words across the set." });
  }

  const withCta = perAsset.filter((p) => p.ctas.length > 0);
  if (withCta.length > 0 && withCta.length < perAsset.length) {
    const without = perAsset.filter((p) => p.ctas.length === 0).map((p) => p.label);
    findings.push({ type: "cta", severity: "medium", detail: "No call to action found in " + without.join(", ") + ", but the other assets have one. Intentional, or a gap?" });
  }
  const allCtas = Array.from(new Set(perAsset.reduce((acc, p) => acc.concat(p.ctas), []))).sort();
  if (allCtas.length > 2) {
    findings.push({ type: "cta", severity: "low", detail: "Assets use " + allCtas.length + " different calls to action: " + allCtas.join(", ") + ". One consistent ask converts better than several." });
  }

  FACT_PATTERNS.forEach((fp) => {
    const sets = perAsset.map((p, i) => {
      const re = new RegExp(fp.re.source, fp.re.flags);
      const found = String(usable[i].text).match(re) || [];
      return Array.from(new Set(found.map(fp.norm))).sort();
    });
    const populated = sets.map((s, i) => ({ s, label: perAsset[i].label })).filter((x) => x.s.length > 0);
    if (populated.length < 2) return;
    const first = populated[0].s.join("|");
    const differs = populated.some((x) => x.s.join("|") !== first);
    if (differs) {
      findings.push({
        type: "fact-" + fp.id,
        severity: "high",
        detail: "Mismatched " + fp.label + " between assets: " + populated.map((x) => x.label + " has " + x.s.join(", ")).join("; ") + ". Check these are meant to differ.",
      });
    }
  });

  findings.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);

  return { perAsset, findings, ok: true, gradeSpread, lenSpread, message: findings.length ? "" : "No drift detected across these assets on the measures this tool checks." };
}

let drState = { assets: [{ label: "Asset 1", text: "" }, { label: "Asset 2", text: "" }], result: null };

function drRenderInputs() {
  const host = document.getElementById("drAssets");
  host.innerHTML = drState.assets.map((a, i) => `
    <div class="field">
      <label for="dr_${i}">${escapeHtml(a.label)}</label>
      <textarea id="dr_${i}" placeholder="Paste an asset — a VSL section, an email, a swipe.">${escapeHtml(a.text)}</textarea>
    </div>`).join("");
  drState.assets.forEach((a, i) => {
    document.getElementById("dr_" + i).addEventListener("input", (e) => {
      drState.assets[i].text = e.target.value;
      wsSet("draft_drift", drState);
    });
  });
}

function drRenderOut() {
  const host = document.getElementById("drOut");
  const r = drState.result;
  if (!r) { host.innerHTML = '<p class="output-placeholder">Paste at least two assets and press Check Drift.</p>'; return; }
  if (!r.ok) { host.innerHTML = `<p class="output-placeholder">${escapeHtml(r.message)}</p>`; return; }
  let html = `<div class="out-section"><h3>Per asset</h3><div class="table-scroll"><table class="data-table">
    <tr><th>Asset</th><th>Words</th><th>Avg sentence</th><th>Reading grade</th><th>CTAs</th></tr>
    ${r.perAsset.map((p) => `<tr><td><strong>${escapeHtml(p.label)}</strong></td><td>${p.words}</td><td>${p.avgSentenceLen}</td><td>${p.grade}</td><td>${p.ctas.length ? escapeHtml(p.ctas.join(", ")) : "—"}</td></tr>`).join("")}
  </table></div></div>`;
  if (!r.findings.length) {
    html += `<div class="verdict-banner v-ship"><div class="v-title">No drift detected</div><div class="v-sub">${escapeHtml(r.message)}</div></div>`;
  } else {
    html += `<div class="out-section"><h3>Findings</h3>` + r.findings.map((f) => `
      <div class="finding">
        <div class="finding-head"><span class="pill pill-${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span><span class="finding-title">${escapeHtml(titleCase(f.type.replace("fact-", "mismatched ")))}</span></div>
        <p class="finding-why" style="color:var(--ink)">${escapeHtml(f.detail)}</p>
      </div>`).join("") + `</div>`;
  }
  host.innerHTML = html;
}

function initDrift() {
  const draft = wsGet("draft_drift", null);
  if (draft && draft.assets && draft.assets.length >= 2) drState = draft;
  drRenderInputs();
  drRenderOut();

  document.getElementById("drAdd").addEventListener("click", () => {
    if (drState.assets.length >= 8) { showToast("Eight assets is the limit"); return; }
    drState.assets.push({ label: "Asset " + (drState.assets.length + 1), text: "" });
    drRenderInputs();
    wsSet("draft_drift", drState);
  });

  document.getElementById("drRun").addEventListener("click", () => {
    drState.result = computeDrift(drState.assets);
    wsSet("draft_drift", drState);
    drRenderOut();
  });

  document.getElementById("drClear").addEventListener("click", () => {
    drState = { assets: [{ label: "Asset 1", text: "" }, { label: "Asset 2", text: "" }], result: null };
    drRenderInputs();
    drRenderOut();
    wsSet("draft_drift", drState);
    showToast("Cleared");
  });

  document.getElementById("drCopy").addEventListener("click", () => {
    if (!drState.result || !drState.result.ok) { showToast("Nothing to copy yet"); return; }
    const r = drState.result;
    copyText("Voice drift report\n\n" + r.perAsset.map((p) => p.label + ": " + p.words + " words, avg sentence " + p.avgSentenceLen + ", grade " + p.grade).join("\n") +
      "\n\n" + (r.findings.length ? r.findings.map((f) => "[" + f.severity.toUpperCase() + "] " + f.detail).join("\n") : r.message));
  });

  const saveable = initSaveable({
    toolId: "drift",
    listEl: document.getElementById("drSavedList"),
    getEntry: () => {
      if (!drState.result || !drState.result.ok) return null;
      return { name: drState.result.perAsset.length + " assets compared", meta: drState.result.findings.length + " finding" + (drState.result.findings.length === 1 ? "" : "s"), payload: { assets: drState.assets, result: drState.result } };
    },
    applyEntry: (p) => {
      drState = { assets: p.assets, result: p.result };
      drRenderInputs();
      drRenderOut();
      wsSet("draft_drift", drState);
    },
  });
  document.getElementById("drSave").addEventListener("click", saveable.save);
}

/* ==========================================================================
   MODULE 3 — RUNWAY
   ========================================================================== */

/* ------------------------------------------------------ Tool 7: Launch Runway */

const RW_ASSETS = [
  { id: "research",    label: "Market research summary", lead: 24, why: "Everything downstream is built on it, so it has to land first." },
  { id: "positioning", label: "Positioning statement",   lead: 21, why: "Locks the angle every other asset is written around." },
  { id: "timeline",    label: "Launch timeline",         lead: 20, why: "You need the dates before you can commit to any of them." },
  { id: "offer",       label: "Offer structure",         lead: 18, why: "The copy can't be written until the offer stops moving." },
  { id: "swipes",      label: "Affiliate swipe pack",    lead: 14, why: "Partners need lead time to slot you into their calendar.", affiliateOnly: true },
  { id: "promo",       label: "Promotional asset list",  lead: 10, why: "Graphics and banners need production time after the list exists." },
  { id: "vsl",         label: "VSL script",              lead: 9,  why: "Script, then record, then edit — the buffer is the recording, not the writing." },
  { id: "emails",      label: "Email sequence",          lead: 4,  why: "Loaded and tested in your sender before the first send goes out." },
];

function parseDay(str) {
  if (!str) return null;
  const d = new Date(str + "T00:00:00Z");
  return isNaN(d.getTime()) ? null : d;
}

function addDays(date, n) {
  return new Date(date.getTime() + n * 86400000);
}

function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function fmtDay(date) {
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function todayUTC() {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/** Back-schedules each delivered asset from cart open using per-asset lead
 *  times. Warns when the requested window physically cannot hold the plan. */
function computeRunway({ cartOpen, cartClose, assets, hasAffiliates, today }) {
  const open = parseDay(cartOpen);
  const close = parseDay(cartClose);
  const now = today ? parseDay(today) : todayUTC();

  if (!open) return { ok: false, message: "Set a cart-open date first.", rows: [] };

  const selected = RW_ASSETS.filter((a) => assets.indexOf(a.id) !== -1 && (!a.affiliateOnly || hasAffiliates));
  if (!selected.length) return { ok: false, message: "Tick at least one delivered asset.", rows: [] };

  const rows = selected.map((a) => {
    const due = addDays(open, -a.lead);
    return { id: a.id, label: a.label, lead: a.lead, why: a.why, due, dueIso: due.toISOString().slice(0, 10), late: daysBetween(now, due) < 0 };
  }).sort((x, y) => (x.due - y.due) || (y.lead - x.lead));

  const runwayDays = daysBetween(now, open);
  const cartWindow = close ? daysBetween(open, close) : null;
  const needed = rows[0].lead;
  const short = needed - runwayDays;

  let warning = "";
  if (short > 0) {
    warning = "Your window is " + short + " day" + (short === 1 ? "" : "s") + " short. A full runway for this asset set needs " + needed + " days before cart open and you have " + runwayDays + ". Either move cart open back, or cut the assets marked overdue below and run without them.";
  }
  let closeWarning = "";
  if (cartWindow !== null && cartWindow <= 0) {
    closeWarning = "Cart close is not after cart open — check those dates.";
  }

  return { ok: true, rows, warning, closeWarning, runwayDays, cartWindow, neededDays: needed, openIso: cartOpen, closeIso: cartClose, message: "" };
}

let rwState = { result: null };

function rwReadInputs() {
  return {
    cartOpen: document.getElementById("rwOpen").value,
    cartClose: document.getElementById("rwClose").value,
    assets: Array.from(document.querySelectorAll("#rwAssets input:checked")).map((i) => i.value),
    hasAffiliates: document.getElementById("rwAffiliates").checked,
  };
}

function rwRenderOut() {
  const host = document.getElementById("rwOut");
  const r = rwState.result;
  if (!r) { host.innerHTML = '<p class="output-placeholder">Set your cart dates, tick your assets, then press Build Runway.</p>'; return; }
  if (!r.ok) { host.innerHTML = `<p class="output-placeholder">${escapeHtml(r.message)}</p>`; return; }
  let html = `<div class="metric-row">
    <div class="metric"><div class="metric-value">${r.runwayDays}</div><div class="metric-label">Days to cart open</div></div>
    <div class="metric"><div class="metric-value">${r.neededDays}</div><div class="metric-label">Days needed</div></div>
    <div class="metric"><div class="metric-value">${r.rows.length}</div><div class="metric-label">Assets</div></div>
    ${r.cartWindow !== null ? `<div class="metric"><div class="metric-value">${r.cartWindow}</div><div class="metric-label">Cart open for</div></div>` : ""}
  </div>`;
  if (r.warning) html += `<div class="verdict-banner v-fix"><div class="v-title">Tight runway</div><div class="v-sub">${escapeHtml(r.warning)}</div></div>`;
  if (r.closeWarning) html += `<div class="verdict-banner v-back"><div class="v-title">Check your dates</div><div class="v-sub">${escapeHtml(r.closeWarning)}</div></div>`;
  html += `<div class="table-scroll"><table class="data-table">
    <tr><th>Due</th><th>Asset</th><th>Lead</th><th>Why then</th></tr>
    ${r.rows.map((row) => `<tr class="${row.late ? "row-overdue" : ""}">
      <td class="${row.late ? "due-late" : ""}"><strong>${escapeHtml(fmtDay(row.due))}</strong>${row.late ? "<br><span class=\"criterion-weight\">already past</span>" : ""}</td>
      <td>${escapeHtml(row.label)}</td>
      <td>${row.lead}d before</td>
      <td style="color:var(--ink-soft)">${escapeHtml(row.why)}</td>
    </tr>`).join("")}
  </table></div>`;
  host.innerHTML = html;
}

function initRunway() {
  const host = document.getElementById("rwAssets");
  host.innerHTML = RW_ASSETS.map((a) => `<label class="check"><input type="checkbox" value="${a.id}" checked /><span>${escapeHtml(a.label)}${a.affiliateOnly ? " <em style=\"color:var(--ink-soft)\">(only if recruiting affiliates)</em>" : ""}</span></label>`).join("");

  const draft = wsGet("draft_runway", null);
  if (draft) {
    document.getElementById("rwOpen").value = draft.inputs.cartOpen || "";
    document.getElementById("rwClose").value = draft.inputs.cartClose || "";
    document.getElementById("rwAffiliates").checked = !!draft.inputs.hasAffiliates;
    document.querySelectorAll("#rwAssets input").forEach((i) => { i.checked = draft.inputs.assets.indexOf(i.value) !== -1; });
    rwState.result = draft.result;
    if (rwState.result && rwState.result.rows) {
      rwState.result.rows = rwState.result.rows.map((r) => ({ ...r, due: new Date(r.dueIso + "T00:00:00Z") }));
    }
  }
  rwRenderOut();

  document.getElementById("rwRun").addEventListener("click", () => {
    const inputs = rwReadInputs();
    rwState.result = computeRunway(inputs);
    wsSet("draft_runway", { inputs, result: rwState.result });
    rwRenderOut();
  });

  document.getElementById("rwClear").addEventListener("click", () => {
    document.getElementById("rwOpen").value = "";
    document.getElementById("rwClose").value = "";
    document.getElementById("rwAffiliates").checked = false;
    document.querySelectorAll("#rwAssets input").forEach((i) => { i.checked = true; });
    rwState.result = null;
    wsSet("draft_runway", null);
    rwRenderOut();
    showToast("Cleared");
  });

  document.getElementById("rwCopy").addEventListener("click", () => {
    if (!rwState.result || !rwState.result.ok) { showToast("Nothing to copy yet"); return; }
    copyText("Launch runway\n\n" + rwState.result.rows.map((r) => fmtDay(r.due) + " — " + r.label + " (" + r.lead + " days before cart open)").join("\n") +
      (rwState.result.warning ? "\n\nWarning: " + rwState.result.warning : ""));
  });

  document.getElementById("rwPrint").addEventListener("click", () => window.print());

  document.getElementById("rwSend").addEventListener("click", () => {
    if (!rwState.result || !rwState.result.ok) { showToast("Build a runway first"); return; }
    const rows = rwState.result.rows.map((r) => ({
      id: r.id + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      assetId: r.id,
      label: r.label,
      due: r.dueIso,
      status: "drafted",
    }));
    wsSet("tracker_rows", rows);
    trRender();
    goTo("runway", "tracker");
    showToast("Sent to Ship Tracker");
  });

  const saveable = initSaveable({
    toolId: "runway",
    listEl: document.getElementById("rwSavedList"),
    getEntry: () => {
      if (!rwState.result || !rwState.result.ok) return null;
      const inputs = rwReadInputs();
      return { name: "Runway to " + (inputs.cartOpen || "?"), meta: rwState.result.rows.length + " assets · " + rwState.result.neededDays + "d needed", payload: { inputs, result: rwState.result } };
    },
    applyEntry: (p) => {
      document.getElementById("rwOpen").value = p.inputs.cartOpen || "";
      document.getElementById("rwClose").value = p.inputs.cartClose || "";
      document.getElementById("rwAffiliates").checked = !!p.inputs.hasAffiliates;
      document.querySelectorAll("#rwAssets input").forEach((i) => { i.checked = p.inputs.assets.indexOf(i.value) !== -1; });
      rwState.result = { ...p.result, rows: p.result.rows.map((r) => ({ ...r, due: new Date(r.dueIso + "T00:00:00Z") })) };
      wsSet("draft_runway", p);
      rwRenderOut();
    },
  });
  document.getElementById("rwSave").addEventListener("click", saveable.save);
}

/* -------------------------------------------------------- Tool 8: Ship Tracker */

const TR_STATUSES = [
  { id: "drafted",   label: "Drafted" },
  { id: "reviewed",  label: "Reviewed" },
  { id: "scheduled", label: "Scheduled" },
  { id: "live",      label: "Live" },
];

/** Produced vs. actually shipped, plus anything past its due date. */
function computeTrackerSummary(rows, todayIso) {
  const now = todayIso ? parseDay(todayIso) : todayUTC();
  const total = rows.length;
  const live = rows.filter((r) => r.status === "live").length;
  const pctShipped = total ? Math.round((live / total) * 100) : 0;
  const overdue = rows.filter((r) => r.status !== "live" && r.due && parseDay(r.due) && daysBetween(now, parseDay(r.due)) < 0);
  return { total, live, pctShipped, overdue, overdueCount: overdue.length };
}

function trGetRows() { return wsGet("tracker_rows", []); }
function trSetRows(rows) { wsSet("tracker_rows", rows); trRender(); }

function trRender() {
  const rows = trGetRows();
  const summaryHost = document.getElementById("trSummary");
  const table = document.getElementById("trTable");
  const empty = document.getElementById("trEmpty");
  const verdicts = wsGet("asset_verdicts", {});

  if (!rows.length) {
    summaryHost.innerHTML = "";
    table.innerHTML = "";
    empty.innerHTML = '<p class="output-placeholder">Nothing tracked yet. Build a plan in Launch Runway and press Send to Ship Tracker, or press Add Row to track something manually.</p>';
    return;
  }
  empty.innerHTML = "";

  const s = computeTrackerSummary(rows);
  summaryHost.innerHTML = `<div class="metric-row">
    <div class="metric"><div class="metric-value">${s.pctShipped}%</div><div class="metric-label">Shipped</div></div>
    <div class="metric"><div class="metric-value">${s.live}/${s.total}</div><div class="metric-label">Live</div></div>
    <div class="metric"><div class="metric-value">${s.overdueCount}</div><div class="metric-label">Overdue</div></div>
  </div>` + (s.overdueCount ? `<div class="verdict-banner v-fix"><div class="v-title">${s.overdueCount} item${s.overdueCount === 1 ? "" : "s"} past due</div><div class="v-sub">${escapeHtml(s.overdue.map((r) => r.label).join(", "))}</div></div>` : "");

  table.innerHTML = `<tr><th>Asset</th><th>Due</th><th>Status</th><th>Verdict</th><th></th></tr>` +
    rows.map((r) => {
      const dueDate = r.due ? parseDay(r.due) : null;
      const isOverdue = r.status !== "live" && dueDate && daysBetween(todayUTC(), dueDate) < 0;
      const v = verdicts[r.assetId];
      return `<tr class="${isOverdue ? "row-overdue" : ""}" data-id="${escapeHtml(r.id)}">
        <td><input type="text" data-f="label" value="${escapeHtml(r.label)}" /></td>
        <td class="${isOverdue ? "due-late" : ""}"><input type="date" data-f="due" value="${escapeHtml(r.due || "")}" /></td>
        <td><select data-f="status">${TR_STATUSES.map((st) => `<option value="${st.id}"${st.id === r.status ? " selected" : ""}>${st.label}</option>`).join("")}</select></td>
        <td>${v ? `<span class="pill ${v.verdict === "Ship it" ? "pill-ok" : v.verdict === "Fix these first" ? "pill-medium" : "pill-high"}">${escapeHtml(v.verdict)}</span>` : '<span style="color:var(--ink-soft)">—</span>'}</td>
        <td><button class="mini-btn" data-del="1" type="button">Remove</button></td>
      </tr>`;
    }).join("");

  table.querySelectorAll("tr[data-id]").forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelectorAll("[data-f]").forEach((el) => {
      el.addEventListener("change", () => {
        const all = trGetRows();
        const row = all.find((x) => x.id === id);
        if (!row) return;
        const field = el.dataset.f;
        if (field === "status" && el.value === "live") {
          const verdict = (wsGet("asset_verdicts", {}))[row.assetId];
          if (verdict && verdict.verdict === "Send it back") {
            showToast("Scorecard sent this back — fix it first");
            el.value = row.status;
            return;
          }
        }
        row[field] = el.value;
        trSetRows(all);
      });
    });
    const del = tr.querySelector("[data-del]");
    if (del) del.addEventListener("click", () => {
      trSetRows(trGetRows().filter((x) => x.id !== id));
      showToast("Removed");
    });
  });
}

function initTracker() {
  trRender();

  document.getElementById("trAdd").addEventListener("click", () => {
    const rows = trGetRows();
    rows.push({ id: "man-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), assetId: "", label: "New asset", due: "", status: "drafted" });
    trSetRows(rows);
  });

  document.getElementById("trCopy").addEventListener("click", () => {
    const rows = trGetRows();
    if (!rows.length) { showToast("Nothing to copy yet"); return; }
    const s = computeTrackerSummary(rows);
    copyText("Ship tracker — " + s.pctShipped + "% shipped (" + s.live + "/" + s.total + ")\n\n" +
      rows.map((r) => "[" + r.status + "] " + r.label + (r.due ? " — due " + r.due : "")).join("\n"));
  });

  const saveable = initSaveable({
    toolId: "tracker",
    listEl: document.getElementById("trSavedList"),
    getEntry: () => {
      const rows = trGetRows();
      if (!rows.length) return null;
      const s = computeTrackerSummary(rows);
      return { name: "Pipeline snapshot — " + s.pctShipped + "% shipped", meta: s.live + "/" + s.total + " live · " + s.overdueCount + " overdue", payload: { rows } };
    },
    applyEntry: (p) => { trSetRows(p.rows); showToast("Pipeline restored"); },
  });
  document.getElementById("trSave").addEventListener("click", saveable.save);
}

/* ------------------------------------------------------ Tool 9: Command Ledger */

const LG_ROLES = [
  { id: "strategist", label: "Strategist",      rate: 325,   range: "$150–500/hr" },
  { id: "copywriter", label: "Copywriter",      rate: 162.5, range: "$75–250/hr" },
  { id: "researcher", label: "Researcher",      rate: 100,   range: "$50–150/hr" },
  { id: "developer",  label: "Developer",       rate: 137.5, range: "$75–200/hr" },
  { id: "designer",   label: "Designer",        rate: 100,   range: "$50–150/hr" },
  { id: "pm",         label: "Project manager", rate: 90,    range: "$60–120/hr" },
  { id: "reviewer",   label: "Reviewer",        rate: 70,    range: "$40–100/hr" },
];

/** Values each command at hours × the combined rate of the specialists it
 *  replaced — a boardroom of three working two hours is six billable hours,
 *  not two. Rates are midpoints of published market ranges. */
function computeLedger(entries) {
  const rateOf = (id) => (LG_ROLES.find((r) => r.id === id) || { rate: 0 }).rate;
  let totalValue = 0;
  let shippedValue = 0;
  let totalHours = 0;
  let totalRevenue = 0;
  let shippedCount = 0;

  const priced = entries.map((e) => {
    const hours = Math.max(0, Number(e.hours) || 0);
    const combinedRate = (e.roles || []).reduce((sum, id) => sum + rateOf(id), 0);
    const value = hours * combinedRate;
    const revenue = Math.max(0, Number(e.revenue) || 0);
    totalValue += value;
    totalHours += hours;
    totalRevenue += revenue;
    if (e.shipped) { shippedValue += value; shippedCount += 1; }
    return { ...e, hours, combinedRate, value, revenue };
  });

  const count = priced.length;
  return {
    entries: priced,
    count,
    shippedCount,
    totalHours: Math.round(totalHours * 10) / 10,
    totalValue,
    shippedValue,
    totalRevenue,
    avgValue: count ? totalValue / count : 0,
    shipRate: count ? Math.round((shippedCount / count) * 100) : 0,
  };
}

function lgGetEntries() { return wsGet("ledger_entries", []); }
function lgSetEntries(e) { wsSet("ledger_entries", e); lgRender(); }

function lgRender() {
  const entries = lgGetEntries();
  const summaryHost = document.getElementById("lgSummary");
  const table = document.getElementById("lgTable");
  const empty = document.getElementById("lgEmpty");

  if (!entries.length) {
    summaryHost.innerHTML = "";
    table.innerHTML = "";
    empty.innerHTML = '<p class="output-placeholder">Nothing logged yet. Press Log a Command after your next boardroom run.</p>';
    return;
  }
  empty.innerHTML = "";

  const l = computeLedger(entries);
  summaryHost.innerHTML = `<div class="metric-row">
    <div class="metric"><div class="metric-value">${money(l.shippedValue)}</div><div class="metric-label">Value shipped</div></div>
    <div class="metric"><div class="metric-value">${money(l.totalValue)}</div><div class="metric-label">Value produced</div></div>
    <div class="metric"><div class="metric-value">${l.totalHours}h</div><div class="metric-label">Hours saved</div></div>
    <div class="metric"><div class="metric-value">${l.shipRate}%</div><div class="metric-label">Ship rate</div></div>
    ${l.totalRevenue > 0 ? `<div class="metric"><div class="metric-value">${money(l.totalRevenue)}</div><div class="metric-label">Revenue booked</div></div>` : ""}
  </div>
  <p class="out-p" style="color:var(--ink-soft)">Average ${money(l.avgValue)} per command across ${l.count} logged. Value only counts as shipped once you tick Shipped — produced work that never went out is worth nothing, however good it was.</p>`;

  table.innerHTML = `<tr><th>Command</th><th>Specialists replaced</th><th>Hours</th><th>Value</th><th>Revenue</th><th>Shipped</th><th></th></tr>` +
    l.entries.map((e) => `<tr data-id="${escapeHtml(e.id)}">
      <td><input type="text" data-f="label" value="${escapeHtml(e.label)}" style="min-width:150px" /></td>
      <td><div class="checks">${LG_ROLES.map((r) => `<label class="check" style="font-size:12px"><input type="checkbox" data-role="${r.id}"${(e.roles || []).indexOf(r.id) !== -1 ? " checked" : ""} /><span>${r.label}</span></label>`).join("")}</div></td>
      <td><input type="number" data-f="hours" min="0" step="0.5" value="${escapeHtml(e.hours)}" style="width:70px" /></td>
      <td><strong>${money(e.value)}</strong><br><span class="criterion-weight">${money(e.combinedRate)}/hr</span></td>
      <td><input type="number" data-f="revenue" min="0" step="1" value="${escapeHtml(e.revenue || 0)}" style="width:90px" /></td>
      <td><input type="checkbox" data-f="shipped"${e.shipped ? " checked" : ""} /></td>
      <td><button class="mini-btn" data-del="1" type="button">Remove</button></td>
    </tr>`).join("");

  table.querySelectorAll("tr[data-id]").forEach((tr) => {
    const id = tr.dataset.id;
    const update = (fn) => {
      const all = lgGetEntries();
      const row = all.find((x) => x.id === id);
      if (!row) return;
      fn(row);
      lgSetEntries(all);
    };
    tr.querySelectorAll("[data-f]").forEach((el) => {
      el.addEventListener("change", () => {
        const f = el.dataset.f;
        update((row) => { row[f] = f === "shipped" ? el.checked : el.value; });
      });
    });
    tr.querySelectorAll("[data-role]").forEach((el) => {
      el.addEventListener("change", () => {
        update((row) => {
          const roles = new Set(row.roles || []);
          if (el.checked) roles.add(el.dataset.role); else roles.delete(el.dataset.role);
          row.roles = Array.from(roles);
        });
      });
    });
    const del = tr.querySelector("[data-del]");
    if (del) del.addEventListener("click", () => {
      lgSetEntries(lgGetEntries().filter((x) => x.id !== id));
      showToast("Removed");
    });
  });
}

function initLedger() {
  lgRender();

  document.getElementById("lgAdd").addEventListener("click", () => {
    const entries = lgGetEntries();
    entries.unshift({ id: "lg-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), label: "New command", roles: ["strategist", "copywriter"], hours: 2, revenue: 0, shipped: false });
    lgSetEntries(entries);
  });

  document.getElementById("lgCopy").addEventListener("click", () => {
    const entries = lgGetEntries();
    if (!entries.length) { showToast("Nothing to copy yet"); return; }
    const l = computeLedger(entries);
    copyText("Command ledger — " + money(l.shippedValue) + " shipped of " + money(l.totalValue) + " produced, " + l.totalHours + "h saved, " + l.shipRate + "% ship rate\n\n" +
      l.entries.map((e) => (e.shipped ? "[shipped] " : "[  open ] ") + e.label + " — " + e.hours + "h × " + money(e.combinedRate) + "/hr = " + money(e.value)).join("\n"));
  });

  const saveable = initSaveable({
    toolId: "ledger",
    listEl: document.getElementById("lgSavedList"),
    getEntry: () => {
      const entries = lgGetEntries();
      if (!entries.length) return null;
      const l = computeLedger(entries);
      return { name: "Ledger snapshot — " + money(l.shippedValue) + " shipped", meta: l.count + " commands · " + l.totalHours + "h · " + l.shipRate + "% shipped", payload: { entries } };
    },
    applyEntry: (p) => { lgSetEntries(p.entries); showToast("Ledger restored"); },
  });
  document.getElementById("lgSave").addEventListener("click", saveable.save);
}

/* ---------------------------------------------------------------- boot */

document.addEventListener("DOMContentLoaded", () => {
  initWorkspace();
  initGate();
  initTheme();
  initTabs();
  initSubTabs();
  initProfileUI();
  initComposer();
  initSplitter();
  initBreaker();
  initScorecard();
  initClaims();
  initDrift();
  initRunway();
  initTracker();
  initLedger();
});
