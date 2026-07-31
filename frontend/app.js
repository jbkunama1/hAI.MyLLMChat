let adminToken = null;
let config = null;
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

function loadThemeAndMode() {
  const savedTheme = localStorage.getItem("hai_theme") || "indigo";
  const savedMode = localStorage.getItem("hai_mode") || "dark";
  applyTheme(savedTheme);
  applyMode(savedMode);
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

async function sendChatMessage(messages, model) {
  const body = { messages };
  if (model) body.model = model;
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

function appendMessage(role, text) {
  const container = el("messages");
  const empty = el("emptyState");
  if (empty) empty.remove();
  const msg = document.createElement("div");
  msg.className = `message ${role}`;
  msg.textContent = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function appendImageMessage(urls) {
  const container = el("messages");
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
document.addEventListener("DOMContentLoaded", async () => {
  loadAdminToken();
  loadThemeAndMode();

  // Sidebar mobile toggle
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
  overlay.addEventListener("click", closeSidebarFn);
  el("settingsButtonMobile").addEventListener("click", () => el("settingsButton").click());

  // Config laden
  config = await fetchConfig();
  if (config) {
    setStatus(
      "online",
      config.chat?.name ? `Verbunden: ${config.chat.name}` : "Kein Chat-Backend konfiguriert"
    );
    el("mcpPill").textContent = "MCP: " + (config.mcp?.enabled ? "aktiv" : "inaktiv");
  } else {
    setStatus("error", "Backend nicht erreichbar");
  }

  // Modelle laden
  const models = await fetchModels();
  const select = el("modelSelect");
  select.innerHTML = "";
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
                } else {
        const messages = [];
        for (const m of history) messages.push(m);
        messages.push({ role: "user", content: finalText });

        const model = select.value || undefined;
        const resp = await sendChatMessage(messages, model);
        const assistantText = resp.content || "";
        appendMessage("assistant", assistantText);

        history.push({ role: "user", content: finalText });
        history.push({ role: "assistant", content: assistantText });
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
  el("loginButton").addEventListener("click", () => loginModal.classList.remove("hidden"));
  el("closeLogin").addEventListener("click", () => loginModal.classList.add("hidden"));
  loginModal.addEventListener("click", (e) => {
    if (e.target === loginModal) loginModal.classList.add("hidden");
  });
  el("loginSubmit").addEventListener("click", () => {
    const u = el("loginUser").value.trim();
    const p = el("loginPass").value.trim();
    if (!u || !p) return;
    saveAdminToken(btoa(`${u}:${p}`));
    loginModal.classList.add("hidden");
    setStatus("online", "Eingeloggt");
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

  // Theme-Swatches klicken
  document.querySelectorAll(".theme-swatch").forEach((sw) => {
    sw.addEventListener("click", () => applyTheme(sw.dataset.theme));
  });

  // Light Mode Checkbox
  const lightCb = el("cfgLightMode");
  if (lightCb) {
    lightCb.checked = (localStorage.getItem("hai_mode") || "dark") === "light";
    lightCb.addEventListener("change", () => {
      applyMode(lightCb.checked ? "light" : "dark");
    });
  }

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
  }

  // Config speichern (nur Backend-relevante Felder)
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
    };
    try {
      await updateConfigOnServer(newCfg);
      alert("Konfiguration gespeichert. Backend nutzt ab jetzt die neuen Werte.");
    } catch (err) {
      console.error(err);
      alert("Fehler beim Speichern der Konfiguration: " + err.message);
    }
  });
});
