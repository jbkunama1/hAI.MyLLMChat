let adminToken = null;
let config = null;
let currentChatId = null; // Track current chat ID
let history = [];
let attachments = [];
let mode = "chat"; // "chat" | "image"
let showArchived = false; // Sidebar: Archiv anzeigen

const THEMES = ["indigo", "sunset", "ocean", "violet", "emerald", "rose", "slate", "amber", "matrix"];
const el = (id) => document.getElementById(id);

function loadAdminToken() {
  adminToken = localStorage.getItem("hai_admin_token") || null;
}
function saveAdminToken(token) {
  adminToken = token;
  if (token) localStorage.setItem("hai_admin_token", token);
  else localStorage.removeItem("hai_admin_token");
}

function applyTheme(theme) {
  if (!THEMES.includes(theme)) theme = "indigo";
  if (theme === "indigo") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
  localStorage.setItem("hai_theme", theme);
  document.querySelectorAll(".theme-swatch").forEach((sw) => {
    sw.classList.toggle("active", sw.dataset.theme === theme);
  });
}

function applyMode(mode) {
  if (mode !== "light" && mode !== "dark") mode = "dark";
  if (mode === "light") {
    document.documentElement.setAttribute("data-mode", "light");
  } else {
    document.documentElement.removeAttribute("data-mode");
  }
  localStorage.setItem("hai_mode", mode);
  const cb = el("cfgLightMode");
  if (cb) cb.checked = mode === "light";
}

function applyBackground(bg) {
  const valid = ["gradient", "dots", "grid", "plain"];
  if (!valid.includes(bg)) bg = "gradient";
  if (bg === "gradient") {
    document.documentElement.removeAttribute("data-bg");
  } else {
    document.documentElement.setAttribute("data-bg", bg);
  }
  localStorage.setItem("hai_bg", bg);
  document.querySelectorAll(".bg-swatch").forEach((b) =>
    b.classList.toggle("active", b.dataset.bg === bg)
  );
}

function applyFontSize(size) {
  const valid = ["small", "medium", "large"];
  if (!valid.includes(size)) size = "medium";
  if (size === "medium") {
    document.documentElement.removeAttribute("data-fontsize");
  } else {
    document.documentElement.setAttribute("data-fontsize", size);
  }
  localStorage.setItem("hai_fontsize", size);
  document.querySelectorAll(".font-size-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.fontsize === size)
  );
}

function applyFontFamily(family) {
  const valid = ["system", "mono", "serif"];
  if (!valid.includes(family)) family = "system";
  if (family === "system") {
    document.documentElement.removeAttribute("data-fontfamily");
  } else {
    document.documentElement.setAttribute("data-fontfamily", family);
  }
  localStorage.setItem("hai_fontfamily", family);
  document.querySelectorAll(".font-family-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.fontfamily === family)
  );
}

function loadThemeAndMode() {
  applyTheme(localStorage.getItem("hai_theme") || "indigo");
  applyMode(localStorage.getItem("hai_mode") || "dark");
  applyBackground(localStorage.getItem("hai_bg") || "gradient");
  applyFontSize(localStorage.getItem("hai_fontsize") || "medium");
  applyFontFamily(localStorage.getItem("hai_fontfamily") || "system");
}

async function fetchConfig() {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) throw new Error("Config-Request failed");
    return await res.json();
  } catch (e) {
    console.error("Config error:", e);
    return null;
  }
}

async function fetchModels() {
  try {
    const res = await fetch("/api/models");
    if (!res.ok) return [];
    const data = await res.json();
    return data.models || [];
  } catch (e) {
    console.error("Models error:", e);
    return [];
  }
}

async function fetchProviders() {
  try {
    const res = await fetch("/api/providers");
    if (!res.ok) return [];
    const data = await res.json();
    return data.providers || [];
  } catch (e) {
    console.error("Providers error:", e);
    return [];
  }
}

async function fetchChats() {
  try {
    const res = await fetch("/api/chats" + (showArchived ? "?include_archived=true" : ""));
    if (!res.ok) return [];
    const data = await res.json();
    return data || [];
  } catch (e) {
    console.error("Chats error:", e);
    return [];
  }
}

// --- Chat-Verlauf-Suche ---
let searchTimer = null;

function renderSearchResults(results, list) {
  list.innerHTML = "";
  if (!results.length) {
    list.innerHTML = `<div class="conversation-item"><span class="conv-title">Keine Treffer</span></div>`;
    return;
  }
  results.forEach((r) => {
    const item = document.createElement("div");
    item.className = "conversation-item search-result";
    const snippet = r.content.length > 80 ? r.content.slice(0, 80) + "…" : r.content;
    item.innerHTML = `
      <span class="conv-title">${escapeHtml(r.chat_name || "Chat #" + r.chat_id)}</span>
      <span class="conv-snippet">${escapeHtml(snippet)}</span>`;
    item.addEventListener("click", async () => {
      currentChatId = r.chat_id;
      await loadChatHistory(currentChatId);
      await renderChatList();
    });
    list.appendChild(item);
  });
}

async function searchHistory(query) {
  const list = el("conversationList");
  if (!query.trim()) {
    await renderChatList();
    return;
  }
  try {
    const res = await fetch(`/api/history/search?q=${encodeURIComponent(query.trim())}`);
    if (!res.ok) return;
    renderSearchResults(await res.json(), list);
  } catch (e) {
    console.error("Search error:", e);
  }
}

function setupHistorySearch() {
  const input = el("historySearch");
  if (!input) return;
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchHistory(input.value), 300);
  });
}

// --- MCP Tools Panel ---
let mcpSelectedTools = {}; // { "server__tool": { name, description, params } }

function buildToolPayload(selected) {
  // Convert selected tool entries into OpenAI tool schema definitions
  return Object.values(selected).map((t) => ({
    type: "function",
    function: {
      name: t.qualified,            // "server__toolname"
      description: t.description || "",
      parameters: t.params || { type: "object", properties: {} },
    },
  }));
}

const WEBSEARCH_HINTS = /search|web|browse|scrape|fetch_url|google|bing|brave/i;

async function loadMcpTools() {
  const list = el("mcpToolsList");
  const pill = el("mcpPill");
  if (!list || !pill) return;
  try {
    const res = await fetch("/api/mcp/tools");
    if (!res.ok) {
      pill.textContent = "MCP: Fehler";
      return;
    }
    const data = await res.json();
    const servers = data.servers || [];
    if (!servers.length) {
      pill.textContent = "MCP: –";
      list.innerHTML = `<div class="mcp-tools-empty">Keine MCP-Server konfiguriert.</div>`;
      return;
    }
    const toolCount = servers.reduce((n, s) => n + (s.tools || []).length, 0);
    pill.textContent = `MCP: ${servers.length} (${toolCount} Tools)`;
    list.innerHTML = "";
    // Websearch-Tools automatisch vorauswählen, falls vorhanden
    let autoSearchPicked = false;
    servers.forEach((s) => {
      const group = document.createElement("div");
      group.className = "mcp-server-group";
      const tools = s.tools || [];
      group.innerHTML = `<div class="mcp-server-name">${escapeHtml(s.name)}</div>`;
      tools.forEach((tool) => {
        const qualified = `${s.name}__${tool.name}`;
        const isWebsearch = WEBSEARCH_HINTS.test(tool.name + " " + (tool.description || ""));
        if (isWebsearch && !mcpSelectedTools[qualified]) {
          // Automatisch aktivieren – Websearch über MCP, falls angeboten
          mcpSelectedTools[qualified] = {
            qualified,
            name: tool.name,
            description: tool.description || "",
            params: tool.inputSchema || { type: "object", properties: {} },
          };
          autoSearchPicked = true;
        }
        const label = document.createElement("label");
        label.className = "mcp-tool-item" + (isWebsearch ? " mcp-tool-websearch" : "");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!mcpSelectedTools[qualified];
        const desc = tool.description ? ` — ${tool.description}` : "";
        const badge = isWebsearch ? " 🌐" : "";
        label.appendChild(cb);
        const span = document.createElement("span");
        span.textContent = tool.name + badge + (desc || "");
        label.appendChild(span);
        cb.addEventListener("change", () => {
          if (cb.checked) {
            mcpSelectedTools[qualified] = {
              qualified,
              name: tool.name,
              description: tool.description || "",
              params: tool.inputSchema || { type: "object", properties: {} },
            };
          } else {
            delete mcpSelectedTools[qualified];
          }
        });
        group.appendChild(label);
      });
      list.appendChild(group);
    });
    if (autoSearchPicked) {
      const note = document.createElement("div");
      note.className = "mcp-tools-note";
      note.textContent = "🌐 Websearch-Tool über MCP automatisch aktiviert.";
      list.prepend(note);
    }
  } catch (e) {
    pill.textContent = "MCP: Fehler";
    console.error("MCP tools error:", e);
  }
}

function setupMcpControls() {
  const pill = el("mcpPill");
  const panel = el("mcpToolsPanel");
  if (!pill || !panel) return;
  pill.addEventListener("click", async () => {
    const willOpen = panel.classList.contains("hidden");
    if (willOpen && !panel.dataset.loaded) {
      await loadMcpTools();
      panel.dataset.loaded = "1";
    }
    panel.classList.toggle("hidden", !willOpen);
  });
  document.addEventListener("click", (e) => {
    if (!panel.classList.contains("hidden") &&
        !panel.contains(e.target) && !pill.contains(e.target)) {
      panel.classList.add("hidden");
    }
  });
}

async function updateConfigOnServer(newCfg) {
  if (!adminToken) throw new Error("Nicht eingeloggt.");
  const res = await fetch("/api/config/update", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Auth": adminToken },
    body: JSON.stringify(newCfg),
  });
  if (!res.ok) throw new Error(`Config-Update-Fehler: ${res.status}`);
  return await res.json();
}

async function fetchAdminConfig() {
  if (!adminToken) return null;
  const res = await fetch("/api/admin/config", {
    headers: { "X-Admin-Auth": adminToken },
  });
  if (!res.ok) throw new Error(`Admin-Config-Fehler: ${res.status}`);
  return await res.json();
}

async function saveAdminConfig(cfg) {
  if (!adminToken) throw new Error("Nicht eingeloggt.");
  const res = await fetch("/api/admin/config/update", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Auth": adminToken },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) throw new Error(`Admin-Config-Update-Fehler: ${res.status}`);
  return await res.json();
}

async function sendChatMessage(message, model, chatId) {
  const body = { messages: [message] };
  if (model) body.model = model;
  if (chatId != null) body.chat_id = chatId;
  const toolPayload = buildToolPayload(mcpSelectedTools);
  if (toolPayload.length) body.tools = toolPayload;
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Chat-Fehler (${res.status})`);
  return await res.json();
}

async function generateImage(prompt) {
  const res = await fetch("/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`Image-Fehler (${res.status})`);
  return await res.json();
}

async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload-Fehler (${res.status})`);
  return await res.json();
}

function appendMessage(role, text, clear = false) {
  const container = el("messages");
  if (clear) container.innerHTML = "";
  const empty = el("emptyState");
  if (empty) empty.remove();
  const msg = document.createElement("div");
  msg.className = `message ${role}`;
  msg.textContent = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

// Denkanzeige: wird angezeigt, während auf die Antwort gewartet wird.
function showThinking() {
  const container = el("messages");
  const empty = el("emptyState");
  if (empty) empty.remove();
  const msg = document.createElement("div");
  msg.className = "message assistant thinking";
  msg.innerHTML = '<span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-text">Denkt nach…</span>';
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}
function removeThinking(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function appendImageMessage(urls, clear = false) {
  const container = el("messages");
  if (clear) container.innerHTML = "";
  const empty = el("emptyState");
  if (empty) empty.remove();
  const msg = document.createElement("div");
  msg.className = "message assistant";
  urls.forEach((u) => {
    const img = document.createElement("img");
    img.src = u;
    img.style.maxWidth = "100%";
    img.style.borderRadius = "10px";
    img.style.display = "block";
    img.style.marginBottom = "0.4rem";
    msg.appendChild(img);
  });
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function autoResize(t) {
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 140) + "px";
}

function renderAttachments() {
  const box = el("attachmentPreview");
  box.innerHTML = "";
  attachments.forEach((a, i) => {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";
    chip.innerHTML = `📄 ${a.name} <button data-i="${i}" type="button">✕</button>`;
    box.appendChild(chip);
  });
  box.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      attachments.splice(Number(btn.dataset.i), 1);
      renderAttachments();
    });
  });
}

function setStatus(state, text) {
  const dot = el("statusDot");
  dot.className = "status-dot " + state;
  el("statusText").textContent = text;
}

function buildUserMessageText(rawText) {
  if (attachments.length === 0) return rawText;
  const fileNotes = attachments
    .map((a) => `[Datei: ${a.name}]${a.summary ? "\n" + a.summary : ""}`)
    .join("\n\n");
  return `${fileNotes}\n\n${rawText}`.trim();
}

function showEmptyState() {
  const container = el("messages");
  container.innerHTML = `<div class="empty-state" id="emptyState">
    <div class="empty-icon">💬</div>
    <h2>Willkommen bei hAI.MyLLMChat</h2>
    <p>Stelle eine Frage, lade eine Datei zur Analyse hoch oder generiere ein Bild.</p>
  </div>`;
}

function resetChat() {
  history = [];
  showEmptyState();
}

async function createNewChat() {
  try {
    const res = await fetch("/api/chat/new", { method: "POST" });
    const data = await res.json();
    currentChatId = data.chat_id;
    resetChat();
    await renderChatList();
  } catch (e) {
    console.error("Error creating new chat:", e);
    alert("Fehler beim Erstellen eines neuen Chats.");
  }
}

async function loadChatHistory(chatId) {
  try {
    const res = await fetch(`/api/chat/${chatId}/history`);
    if (!res.ok) throw new Error(`History-Fehler (${res.status})`);
    const messages = await res.json();
    history = messages.map((m) => ({ role: m.role, content: m.content }));
    const container = el("messages");
    const empty = el("emptyState");
    if (empty) empty.remove();
    container.innerHTML = "";
    messages.forEach((m) => {
      appendMessage(m.role, m.content);
    });
    if (!messages.length) showEmptyState();
  } catch (e) {
    console.error("Error loading history:", e);
    showEmptyState();
  }
}

async function renderChatList() {
  const list = el("conversationList");
  if (!list) return;
  try {
    const chats = await fetchChats();
    list.innerHTML = "";
    if (!chats.length) {
      const defaultItem = document.createElement("div");
      defaultItem.className = "conversation-item active";
      defaultItem.innerHTML = `<span class="conv-title">Keine Chats</span>`;
      defaultItem.addEventListener("click", createNewChat);
      list.appendChild(defaultItem);
      return chats;
    }
    chats.forEach((c) => {
      const item = document.createElement("div");
      item.className = "conversation-item";
      if (c.archived) item.classList.add("archived");
      if (c.id === currentChatId) item.classList.add("active");
      item.dataset.id = String(c.id);
      const title = c.name && c.name !== "New Chat" ? c.name : "Neuer Chat";
      const actions = `
        <span class="conv-actions">
          <button class="conv-act" data-action="rename" title="Umbenennen">✏️</button>
          <button class="conv-act" data-action="archive" title="${c.archived ? "Wiederherstellen" : "Archivieren"}">${c.archived ? "↩️" : "🗄️"}</button>
          <button class="conv-act" data-action="export" title="Exportieren">⬇️</button>
        </span>`;
      item.innerHTML = `<span class="conv-title">${escapeHtml(title)}</span>${actions}`;
      list.appendChild(item);
    });
    return chats;
  } catch (e) {
    console.error("renderChatList error:", e);
    return [];
  }
}

async function renameChat(chatId) {
  const name = prompt("Neuer Name für den Chat:");
  if (name === null) return;
  if (!name.trim()) return;
  try {
    const res = await fetch(`/api/chat/${chatId}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) throw new Error(`Rename-Fehler (${res.status})`);
    await renderChatList();
  } catch (e) {
    console.error("Rename error:", e);
    alert("Umbenennen fehlgeschlagen: " + e.message);
  }
}

async function archiveChat(chatId, archived) {
  try {
    const res = await fetch(`/api/chat/${chatId}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    if (!res.ok) throw new Error(`Archive-Fehler (${res.status})`);
    if (archived && currentChatId === chatId) {
      currentChatId = null;
      resetChat();
    }
    await renderChatList();
  } catch (e) {
    console.error("Archive error:", e);
    alert("Archivieren fehlgeschlagen: " + e.message);
  }
}

async function exportChat(chatId, format = "markdown") {
  try {
    const res = await fetch(`/api/chat/${chatId}/export?format=${format}`);
    if (!res.ok) throw new Error(`Export-Fehler (${res.status})`);
    const data = await res.json();
    const blob = new Blob(
      [format === "json" ? JSON.stringify(data, null, 2) : data.content],
      { type: format === "json" ? "application/json" : "text/markdown" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `chat-${chatId}.${format === "json" ? "json" : "md"}`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    console.error("Export error:", e);
    alert("Export fehlgeschlagen: " + e.message);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- Provider-Verwaltung im Settings-Modal ---
// Vergleicht zwei Listen: macht items mit gleicher id löschbar.
let providerDrafts = [];

function renderProviderList(list) {
  providerDrafts = list.map((p) => {
    if (p != null && typeof p === "object") return { ...p };
    return {};
  });
  if (!el("providerList")) return;
  const container = el("providerList");
  container.innerHTML = "";
  // Feste Karte für den Standard aus ENV/Chat-Config (nicht löschbar)
  const defaultSelected = !providerDrafts.some((p) => p.selected);
  renderDefaultProviderCard(defaultSelected);
  providerDrafts.forEach((p, i) => renderProviderCard(p, i));
}

function renderDefaultProviderCard(selected) {
  const container = el("providerList");
  const card = document.createElement("div");
  card.className = "provider-card default-provider-card";
  card.innerHTML = `
    <div class="provider-row">
      <label style="flex:1;min-width:0;">Name
        <input id="pvDefaultName" type="text" value="${escapeHtml(config?.chat?.name || "Standard (ENV)")}" readonly />
      </label>
    </div>
    <div class="provider-row">
      <label style="flex:1;min-width:0;">Base URL
        <input id="pvDefaultUrl" type="text" value="${escapeHtml(config?.chat?.base_url || "")}" readonly />
      </label>
    </div>
    <div class="provider-row">
      <label style="flex:1;min-width:0;">Modell
        <input id="pvDefaultModel" type="text" value="${escapeHtml(config?.chat?.model || "")}" readonly />
      </label>
    </div>
    <div class="provider-row">
      <label class="checkbox-field">
        <input id="pvDefaultSelected" type="checkbox" ${selected ? "checked" : ""} />
        <span>Standard-Anbieter (ENV)</span>
      </label>
    </div>
    <div class="provider-actions">
      <span class="provider-default-hint">Standard aus ENV/Config — kann nicht entfernt werden.</span>
    </div>
  `;
  container.appendChild(card);

  card.querySelector("#pvDefaultSelected").addEventListener("change", (e) => {
    if (e.target.checked) {
      providerDrafts.forEach((_, i) => {
        const cb = el(`pvSelected${i}`);
        if (cb) cb.checked = false;
      });
    }
  });
}

function renderProviderCard(p, i) {
  const container = el("providerList");
  const card = document.createElement("div");
  card.className = "provider-card";
  card.dataset.index = i;
  card.innerHTML = `
    <div class="provider-row">
      <label style="flex:1;min-width:0;">Name
        <input id="pvName${i}" type="text" value="${escapeHtml(p.name || "")}" placeholder="z.B. OpenRouter" />
      </label>
    </div>
    <div class="provider-row">
      <label style="flex:1;min-width:0;">Base URL
        <input id="pvUrl${i}" type="text" value="${escapeHtml(p.base_url || "")}" placeholder="https://.../v1" />
      </label>
    </div>
    <div class="provider-row">
      <label style="flex:1;min-width:0;">API-Key
        <input id="pvKey${i}" type="password" value="${escapeHtml(p.api_key && p.api_key !== "***" ? p.api_key : "")}" placeholder="sk-…" />
      </label>
    </div>
    <div class="provider-row">
      <label style="flex:1;min-width:0;">Modelle (kommagetrennt)
        <input id="pvModels${i}" type="text" value="${escapeHtml((p.models || []).join(", "))}" placeholder="gpt-4o, claude-3, llama" />
      </label>
    </div>
    <div class="provider-row">
      <label class="checkbox-field">
        <input id="pvSelected${i}" type="checkbox" ${p.selected ? "checked" : ""} />
        <span>Standard-Anbieter</span>
      </label>
    </div>
    <div class="provider-actions">
      <button class="ghost-btn" style="margin-top:0;" data-action="remove">Entfernen</button>
    </div>
  `;
  container.appendChild(card);

  // Wenn ein konfigurierter Anbieter als Standard gewählt wird, ENV-Standard abwählen
  const selCb = card.querySelector(`#pvSelected${i}`);
  if (selCb) {
    selCb.addEventListener("change", (e) => {
      if (e.target.checked) {
        const defCb = el("pvDefaultSelected");
        if (defCb) defCb.checked = false;
      }
    });
  }

  card.querySelectorAll("[data-action=remove]").forEach((btn) =>
    btn.addEventListener("click", () => {
      providerDrafts.splice(i, 1);
      renderProviderList(providerDrafts);
    })
  );
}

function collectProviderDrafts() {
  // Wenn ENV-Standard gewählt ist, werden alle konfigurierten deselektiert
  const defaultSelected = el("pvDefaultSelected")?.checked || false;
  return providerDrafts.map((p, i) => ({
    id: p.id, // id wird beim Speichern beibehalten oder neu generiert
    name: (el(`pvName${i}`)?.value || "").trim(),
    base_url: (el(`pvUrl${i}`)?.value || "").trim(),
    api_key: (el(`pvKey${i}`)?.value || "").trim(),
    models: (el(`pvModels${i}`)?.value || "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    selected: defaultSelected ? false : (el(`pvSelected${i}`)?.checked || false),
  }));
}

// --- Admin-Tab: Formular für Provider/Modelle/MCP-Server ---
const ADMIN_PROVIDER_FIELDS = [
  { k: "name", label: "Name *", required: true, ph: "z.B. OpenRouter" },
  { k: "base_url", label: "Base URL *", required: true, ph: "https://.../v1" },
  { k: "api_key", label: "API-Key", type: "password", ph: "sk-…" },
];
const ADMIN_MODEL_FIELDS = [{ k: "name", label: "Name *", required: true, ph: "z.B. gpt-4o" }];
const ADMIN_MCP_FIELDS = [
  { k: "name", label: "Name *", required: true, ph: "z.B. mcpo" },
  { k: "url", label: "URL *", required: true, ph: "http://mcpo:8000" },
  { k: "api_key", label: "API-Key", type: "password", ph: "…" },
];

function renderAdminList(listId, items, fieldDefs, opts = {}) {
  const box = el(listId);
  if (!box) return;
  box.innerHTML = "";
  items.forEach((item, i) => {
    const card = document.createElement("div");
    card.className = "provider-card";
    let rows = fieldDefs
      .map(
        (f) => `
      <div class="provider-row"><label style="flex:1;min-width:0;">${f.label}
        <input id="${listId}-f${i}-${f.k}" type="${f.type || "text"}" value="${escapeHtml(item[f.k] || "")}" placeholder="${f.ph || ""}" ${f.required ? "required" : ""} />
      </label></div>`
      )
      .join("");
    if (opts.models)
      rows += `
      <div class="provider-row"><label style="flex:1;min-width:0;">Modelle (kommagetrennt)
        <input id="${listId}-f${i}-models" type="text" value="${escapeHtml((item.models || []).join(", "))}" placeholder="gpt-4o, claude-3" />
      </label></div>`;
    if (opts.selected)
      rows += `
      <div class="provider-row"><label class="checkbox-field">
        <input id="${listId}-f${i}-selected" type="checkbox" ${item.selected ? "checked" : ""} />
        <span>Standard-Anbieter</span>
      </label></div>`;
    rows += `
      <div class="provider-actions">
        <button type="button" class="ghost-btn" data-remove>Entfernen</button>
      </div>`;
    card.innerHTML = rows;
    card.querySelector("[data-remove]").addEventListener("click", () => {
      items.splice(i, 1);
      renderAdminList(listId, items, fieldDefs, opts);
    });
    box.appendChild(card);
  });
}

function collectAdminList(listId, items, fieldDefs, opts = {}) {
  return items.map((item, i) => {
    const out = { id: item.id };
    fieldDefs.forEach((f) => {
      const v = (el(`${listId}-f${i}-${f.k}`)?.value || "").trim();
      if (f.required && !v) throw new Error(`${f.label} (Zeile ${i + 1}) fehlt.`);
      out[f.k] = v;
    });
    if (opts.models)
      out.models = (el(`${listId}-f${i}-models`)?.value || "")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);
    if (opts.selected) out.selected = !!el(`${listId}-f${i}-selected`)?.checked;
    return out;
  });
}

// Sidebar-Events
const setupSidebar = () => {
  const sidebar = el("sidebar");
  const overlay = el("sidebarOverlay");
  const openSidebar = () => {
    sidebar.classList.add("open");
    overlay.classList.remove("hidden");
  };
  const closeSidebarFn = () => {
    sidebar.classList.remove("open");
    overlay.classList.add("hidden");
  };
  el("menuToggle").addEventListener("click", openSidebar);
  el("closeSidebar").addEventListener("click", closeSidebarFn);
  if (overlay) overlay.addEventListener("click", closeSidebarFn);
  if (el("settingsButtonMobile"))
    el("settingsButtonMobile").addEventListener("click", () => el("settingsButton").click());
};

// Theme-Swatches, Background, Font-Size, Font-Family clicks
const setupDesignListeners = () => {
  document.querySelectorAll(".theme-swatch").forEach((sw) => {
    sw.addEventListener("click", () => applyTheme(sw.dataset.theme));
  });
  document.querySelectorAll(".bg-swatch").forEach((b) => {
    b.addEventListener("click", () => applyBackground(b.dataset.bg));
  });
  document.querySelectorAll(".font-size-btn").forEach((b) => {
    b.addEventListener("click", () => applyFontSize(b.dataset.fontsize));
  });
  document.querySelectorAll(".font-family-btn").forEach((b) => {
    b.addEventListener("click", () => applyFontFamily(b.dataset.fontfamily));
  });
};

document.addEventListener("DOMContentLoaded", async () => {
  loadAdminToken();
  loadThemeAndMode();
  setupSidebar();
  setupDesignListeners();
  setupHistorySearch();
  setupMcpControls();

  // New chat button
  el("newChatButton").addEventListener("click", createNewChat);

  // Archiv-Toggle
  const archiveToggle = el("archiveToggle");
  if (archiveToggle) {
    archiveToggle.addEventListener("click", () => {
      showArchived = !showArchived;
      archiveToggle.classList.toggle("active", showArchived);
      archiveToggle.textContent = showArchived ? "🗄️ Nur aktive Chats" : "🗄️ Archiv anzeigen";
      renderChatList();
    });
  }

  // Export-Button in der Top-Bar (exportiert den aktuellen Chat)
  const exportBtn = el("exportChatButton");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      if (currentChatId == null) {
        alert("Kein Chat ausgewählt.");
        return;
      }
      exportChat(currentChatId);
    });
  }

  // Conversation list click -> switch chats
  el("conversationList").addEventListener("click", async (e) => {
    const actBtn = e.target.closest(".conv-act");
    if (actBtn) {
      const item = actBtn.closest(".conversation-item");
      if (!item) return;
      const chatId = Number(item.dataset.id);
      const action = actBtn.dataset.action;
      if (action === "rename") return renameChat(chatId);
      if (action === "archive") return archiveChat(chatId, !item.classList.contains("archived"));
      if (action === "export") return exportChat(chatId);
      return;
    }
    let target = e.target;
    while (target !== null && !target.classList.contains("conversation-item")) {
      target = target.parentElement;
    }
    if (target && target.dataset.id) {
      const newChatId = Number(target.dataset.id);
      if (!isNaN(newChatId) && newChatId !== currentChatId) {
        currentChatId = newChatId;
        await loadChatHistory(currentChatId);
        await renderChatList();
      }
    }
  });

  // Initial chat list load + auto-select most recent
  const chats = await renderChatList();
  if (!currentChatId && chats && chats.length) {
    currentChatId = chats[0].id;
    await loadChatHistory(currentChatId);
    await renderChatList();
  }

  // Config laden
  config = await fetchConfig();
  if (!adminToken) {
    // Ohne Login keine Verbindungs-/Provider-Infos anzeigen
    setStatus("idle", "Nicht eingeloggt");
    el("mcpPill").textContent = "MCP: –";
    el("mcpPill").style.display = "none";
  } else if (config) {
    setStatus(
      "online",
      config.chat?.name ? `Verbunden: ${config.chat.name}` : "Kein Chat-Backend konfiguriert"
    );
    el("mcpPill").textContent = "MCP: " + (config.mcp?.enabled ? "aktiv" : "inaktiv");
    el("mcpPill").style.display = "";
  } else {
    setStatus("error", "Backend nicht erreichbar");
    el("mcpPill").textContent = "MCP: –";
    el("mcpPill").style.display = "none";
  }

  // Provider + Modelle laden
  const providerSelect = el("providerSelect");
  const select = el("modelSelect");

  async function populateModelSelect() {
    select.innerHTML = "";
    const models = await fetchModels();
    if (models.length) {
      models.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
      });
      if (config?.chat?.model && models.includes(config.chat.model)) {
        select.value = config.chat.model;
      }
    } else if (config?.chat?.model) {
      const opt = document.createElement("option");
      opt.value = config.chat.model;
      opt.textContent = config.chat.model;
      select.appendChild(opt);
    } else {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Kein Modell konfiguriert";
      select.appendChild(opt);
    }
  }

  const providers = await fetchProviders();
  if (providers.length) {
    providerSelect.innerHTML = "";
    providers.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id || p.name || "";
      opt.textContent = p.name || p.id;
      providerSelect.appendChild(opt);
      if (p.selected) providerSelect.value = opt.value;
    });
    providerSelect.addEventListener("change", async () => {
      try {
        await fetch("/api/providers/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider_id: providerSelect.value }),
        });
      } catch (e) {
        console.error("Provider select error:", e);
      }
      await populateModelSelect();
    });
    // Refresh-Models-Button
    const refreshBtn = el("refreshModels");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = "⏳";
        try {
          const res = await fetch("/api/providers/refresh-models", { method: "POST" });
          if (!res.ok) throw new Error(`Refresh-Fehler (${res.status})`);
          const data = await res.json();
          select.innerHTML = "";
          (data.models || []).forEach((m) => {
            const opt = document.createElement("option");
            opt.value = m;
            opt.textContent = m;
            select.appendChild(opt);
          });
        } catch (e) {
          console.error("Models refresh error:", e);
          alert("Modelle konnten nicht aktualisiert werden: " + e.message);
        } finally {
          refreshBtn.disabled = false;
          refreshBtn.textContent = "🔄";
        }
      });
    }
    await populateModelSelect();
  } else {
    providerSelect.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Kein Anbieter konfiguriert";
    providerSelect.appendChild(opt);
    await populateModelSelect();
  }

  // Textarea + Enter-to-send
  const userInput = el("userInput");
  userInput.addEventListener("input", () => autoResize(userInput));
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      el("chatForm").requestSubmit();
    }
  });

  // Upload
  el("uploadButton").addEventListener("click", () => el("fileInput").click());
  el("fileInput").addEventListener("change", async (e) => {
    for (const file of e.target.files) {
      try {
        const result = await uploadFile(file);
        attachments.push({ name: file.name, summary: result.summary || "" });
      } catch (err) {
        console.error(err);
        alert(`Upload von ${file.name} fehlgeschlagen.`);
      }
    }
    renderAttachments();
    e.target.value = "";
  });

  // Bild-Modus
  const imageBtn = el("imageModeButton");
  imageBtn.addEventListener("click", () => {
    mode = mode === "chat" ? "image" : "chat";
    imageBtn.style.background = mode === "image" ? "var(--accent-soft)" : "transparent";
    userInput.placeholder = mode === "image" ? "Bildbeschreibung eingeben…" : "Nachricht schreiben…";
  });

  // Chat-Form
  const chatForm = el("chatForm");
  const sendBtn = el("sendBtn");
  chatForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const rawText = userInput.value.trim();
    if (!rawText && attachments.length === 0) return;

    const displayText = rawText || "(Datei ohne Text gesendet)";
    appendMessage("user", displayText);

    const finalText = buildUserMessageText(rawText);
    userInput.value = "";
    autoResize(userInput);
    sendBtn.disabled = true;

    try {
      if (mode === "image") {
        const thinking = showThinking();
        let resp;
        try {
          resp = await generateImage(finalText);
        } finally {
          removeThinking(thinking);
        }
        const urls = (resp.images || []).map((i) => i.url);
        if (urls.length) {
          appendImageMessage(urls);
        } else {
          appendMessage("assistant", "Keine Bilder erhalten (Image-Backend prüfen).");
        }
      } else {
        const model = select.value || undefined;
        const thinking = showThinking();
        let assistantText;
        try {
          const resp = await sendChatMessage(
            { role: "user", content: finalText },
            model,
            currentChatId
          );
          assistantText = resp.content || "";
          currentChatId = resp.chat_id;
        } finally {
          removeThinking(thinking);
        }
        appendMessage("assistant", assistantText);

        history.push({ role: "user", content: finalText });
        history.push({ role: "assistant", content: assistantText });
        await renderChatList();
      }
    } catch (err) {
      console.error(err);
      appendMessage("assistant", "Fehler: " + err.message);
    } finally {
      attachments = [];
      renderAttachments();
      sendBtn.disabled = false;
    }
  });

  // Login-Modal
  const loginModal = el("loginModal");
  const loginButton = el("loginButton");
  const updateLoginUI = () => {
    if (adminToken) {
      loginButton.textContent = "👤 Eingeloggt";
    } else {
      loginButton.textContent = "🔒 Login";
    }
  };
  updateLoginUI();
  loginButton.addEventListener("click", () => {
    if (adminToken) {
      saveAdminToken(null);
      updateLoginUI();
      setStatus("idle", "Nicht eingeloggt");
      el("mcpPill").textContent = "MCP: –";
      el("mcpPill").style.display = "none";
      return;
    }
    loginModal.classList.remove("hidden");
  });
  el("closeLogin").addEventListener("click", () => loginModal.classList.add("hidden"));
  loginModal.addEventListener("click", (e) => {
    if (e.target === loginModal) loginModal.classList.add("hidden");
  });
  el("loginSubmit").addEventListener("click", async () => {
    const u = el("loginUser").value.trim();
    const p = el("loginPass").value.trim();
    if (!u || !p) return;
    saveAdminToken(btoa(`${u}:${p}`));
    updateLoginUI();
    loginModal.classList.add("hidden");
    // Config neu laden, damit Verbindung/Provider-Infos erscheinen
    config = await fetchConfig();
    if (config) {
      setStatus(
        "online",
        config.chat?.name ? `Verbunden: ${config.chat.name}` : "Kein Chat-Backend konfiguriert"
      );
      loadMcpTools();
    } else {
      setStatus("error", "Backend nicht erreichbar");
    }
  });

  // Admin-Tab: Formular für Provider/Modelle/MCP-Server
  const settingsModal = el("settingsModal");
  const openSettings = () => settingsModal.classList.remove("hidden");
  const closeSettings = () => settingsModal.classList.add("hidden");
  const adminState = { providers: [], models: [], mcp_servers: [] };

  const renderAdminForm = () => {
    renderAdminList("adminProviders", adminState.providers, ADMIN_PROVIDER_FIELDS, {
      models: true,
      selected: true,
    });
    renderAdminList("adminModels", adminState.models, ADMIN_MODEL_FIELDS);
    renderAdminList("adminMcpServers", adminState.mcp_servers, ADMIN_MCP_FIELDS);
  };

  const loadAdminForm = async () => {
    try {
      const cfg = await fetchAdminConfig();
      if (!cfg) {
        alert("Nicht eingeloggt — bitte erst Login.");
        return;
      }
      adminState.providers = cfg.providers || [];
      adminState.models = cfg.models || [];
      adminState.mcp_servers = cfg.mcp_servers || [];
      renderAdminForm();
    } catch (e) {
      alert("Admin-Konfiguration konnte nicht geladen werden: " + e.message);
    }
  };

  el("adminAddProvider").addEventListener("click", () => {
    adminState.providers.push({});
    renderAdminForm();
  });
  el("adminAddModel").addEventListener("click", () => {
    adminState.models.push({});
    renderAdminForm();
  });
  el("adminAddMcp").addEventListener("click", () => {
    adminState.mcp_servers.push({});
    renderAdminForm();
  });

  el("adminSaveForm").addEventListener("click", async () => {
    try {
      const cfg = {
        providers: collectAdminList("adminProviders", adminState.providers, ADMIN_PROVIDER_FIELDS, {
          models: true,
          selected: true,
        }),
        models: collectAdminList("adminModels", adminState.models, ADMIN_MODEL_FIELDS),
        mcp_servers: collectAdminList("adminMcpServers", adminState.mcp_servers, ADMIN_MCP_FIELDS),
      };
      await saveAdminConfig(cfg);
      alert("Admin-Konfiguration gespeichert.");
      await loadAdminForm();
    } catch (e) {
      alert(`Fehler beim Speichern: ${e.message}`);
    }
  });
  // Beim Öffnen des Settings-Modals aktuelle Admin-Konfiguration laden
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettings();
  });
  el("settingsButton").addEventListener("click", () => {
    openSettings();
    loadAdminForm();
  });
  el("closeSettings").addEventListener("click", closeSettings);

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(tab).classList.add("active");
    });
  });

  // Settings-Felder initial befüllen
  if (config) {
    if (config.chat) {
      el("cfgChatName").value = config.chat.name || "";
      el("cfgChatBaseUrl").value = config.chat.base_url || "";
      el("cfgChatModel").value = config.chat.model || "";
    }
    if (config.image) {
      el("cfgImageName").value = config.image.name || "";
      el("cfgImageBaseUrl").value = config.image.base_url || "";
    }
    if (config.mcp) {
      el("cfgMcpEnabled").checked = !!config.mcp.enabled;
      el("cfgMcpBaseUrl").value = config.mcp.base_url || "";
    }
    renderProviderList(config.providers || []);
  }

  // Light Mode Checkbox
  const lightCb = el("cfgLightMode");
  if (lightCb) {
    lightCb.checked = (localStorage.getItem("hai_mode") || "dark") === "light";
    lightCb.addEventListener("change", () => {
      applyMode(lightCb.checked ? "light" : "dark");
    });
  }

  // Provider hinzufügen (einmalig verdrahten)
  if (el("addProvider")) {
    el("addProvider").addEventListener("click", () => {
      providerDrafts.push({ name: "", base_url: "", api_key: "", models: "", selected: false });
      renderProviderList(providerDrafts);
    });
  }

  // Config speichern
  el("saveConfig").addEventListener("click", async () => {
    const newCfg = {
      chat: {
        name: el("cfgChatName").value || null,
        base_url: el("cfgChatBaseUrl").value || null,
        model: el("cfgChatModel").value || null,
      },
      image: {
        name: el("cfgImageName").value || null,
        base_url: el("cfgImageBaseUrl").value || null,
      },
      mcp: {
        enabled: el("cfgMcpEnabled").checked,
        base_url: el("cfgMcpBaseUrl").value || null,
      },
      providers: collectProviderDrafts(),
    };
    try {
      await updateConfigOnServer(newCfg);
      alert("Konfiguration gespeichert. Backend nutzt ab jetzt die neuen Werte.");
      // Provider-/Modell-Dropdowns oben aktualisieren
      config = await fetchConfig();
      const refreshed = await fetchProviders();
      if (refreshed.length) {
        providerSelect.innerHTML = "";
        refreshed.forEach((p) => {
          const opt = document.createElement("option");
          opt.value = p.id || p.name || "";
          opt.textContent = p.name || p.id;
          providerSelect.appendChild(opt);
          if (p.selected) providerSelect.value = opt.value;
        });
        await populateModelSelect();
      }
    } catch (err) {
      console.error(err);
      alert("Fehler beim Speichern der Konfiguration: " + err.message);
    }
  });
});
