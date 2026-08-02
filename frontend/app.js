let adminToken = null;
let config = null;
let currentChatId = null; // Track current chat ID
let history = [];
let attachments = [];
let mode = "chat"; // "chat" | "image"

const THEMES = ["indigo", "orange", "emerald", "rose", "slate"];
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
    const res = await fetch("/api/chats");
    if (!res.ok) return [];
    const data = await res.json();
    return data || [];
  } catch (e) {
    console.error("Chats error:", e);
    return [];
  }
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

async function sendChatMessage(message, model, chatId) {
  const body = { messages: [message] };
  if (model) body.model = model;
  if (chatId != null) body.chat_id = chatId;
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
      if (c.id === currentChatId) item.classList.add("active");
      item.dataset.id = String(c.id);
      const title = c.name && c.name !== "New Chat" ? c.name : "Neuer Chat";
      item.innerHTML = `<span class="conv-title">${escapeHtml(title)}</span>`;
      list.appendChild(item);
    });
    return chats;
  } catch (e) {
    console.error("renderChatList error:", e);
    return [];
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
  if (!providerDrafts.length) {
    container.innerHTML = `<div class="provider-list-empty">Keine Anbieter konfiguriert.</div>`;
  }
  providerDrafts.forEach((p, i) => renderProviderCard(p, i));
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

  card.querySelectorAll("[data-action=remove]").forEach((btn) =>
    btn.addEventListener("click", () => {
      providerDrafts.splice(i, 1);
      renderProviderList(providerDrafts);
    })
  );
}

function collectProviderDrafts() {
  return providerDrafts.map((p, i) => ({
    id: p.id, // id wird beim Speichern beibehalten oder neu generiert
    name: (el(`pvName${i}`)?.value || "").trim(),
    base_url: (el(`pvUrl${i}`)?.value || "").trim(),
    api_key: (el(`pvKey${i}`)?.value || "").trim(),
    models: (el(`pvModels${i}`)?.value || "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    selected: el(`pvSelected${i}`)?.checked || false,
  }));
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

  // New chat button
  el("newChatButton").addEventListener("click", createNewChat);

  // Conversation list click -> switch chats
  el("conversationList").addEventListener("click", async (e) => {
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
        const resp = await generateImage(finalText);
        const urls = (resp.images || []).map((i) => i.url);
        if (urls.length) {
          appendImageMessage(urls);
        } else {
          appendMessage("assistant", "Keine Bilder erhalten (Image-Backend prüfen).");
        }
      } else {
        const model = select.value || undefined;
        const resp = await sendChatMessage(
          { role: "user", content: finalText },
          model,
          currentChatId
        );
        const assistantText = resp.content || "";
        currentChatId = resp.chat_id;
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
      el("mcpPill").textContent = "MCP: " + (config.mcp?.enabled ? "aktiv" : "inaktiv");
      el("mcpPill").style.display = "";
    } else {
      setStatus("error", "Backend nicht erreichbar");
    }
  });

  // Settings-Modal + Tabs
  const settingsModal = el("settingsModal");
  const openSettings = () => settingsModal.classList.remove("hidden");
  const closeSettings = () => settingsModal.classList.add("hidden");
  el("settingsButton").addEventListener("click", openSettings);
  el("closeSettings").addEventListener("click", closeSettings);
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettings();
  });

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
