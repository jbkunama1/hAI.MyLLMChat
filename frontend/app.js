let adminToken = null;
let config = null;
let history = [];
let attachments = [];
let mode = "chat"; // "chat" | "image"

const el = (id) => document.getElementById(id);

function loadAdminToken() {
  adminToken = localStorage.getItem("hai_admin_token") || null;
}
function saveAdminToken(token) {
  adminToken = token;
  if (token) localStorage.setItem("hai_admin_token", token);
  else localStorage.removeItem("hai_admin_token");
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

function openModal(modalEl) {
  modalEl.classList.remove("hidden");
}
function closeModal(modalEl) {
  modalEl.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", async () => {
  loadAdminToken();

  // --- Sidebar mobile toggle ---
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

  // --- Config laden ---
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

  // --- Modelle laden ---
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

  // --- Textarea auto-resize + Enter-to-send ---
  const userInput = el("userInput");
  userInput.addEventListener("input", () => autoResize(userInput));
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      el("chatForm").requestSubmit();
    }
  });

  // --- Upload ---
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

  // --- Bild-Modus umschalten ---
  const imageBtn = el("imageModeButton");
  imageBtn.addEventListener("click", () => {
    mode = mode === "chat" ? "image" : "chat";
    imageBtn.style.background = mode === "image" ? "var(--accent-soft)" : "transparent";
    userInput.placeholder =
      mode === "image" ? "Bildbeschreibung eingeben…" : "Nachricht schreiben…";
  });

  // --- Chat-Form Submit ---
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

  // --- Login-Modal ---
  const loginModal = el("loginModal");
  const openLoginModal = () => openModal(loginModal);
  el("loginButton").addEventListener("click", openLoginModal);
  el("closeLogin").addEventListener("click", () => closeModal(loginModal));
  loginModal.addEventListener("click", (e) => {
    if (e.target === loginModal) closeModal(loginModal);
  });
  el("loginSubmit").addEventListener("click", () => {
    const u = el("loginUser").value.trim();
    const p = el("loginPass").value.trim();
    if (!u || !p) return;
    saveAdminToken(btoa(`${u}:${p}`));
    closeModal(loginModal);
    setStatus("online", "Eingeloggt");
  });

  // --- Settings-Modal + Tabs ---
  const settingsModal = el("settingsModal");
  const openSettings = () => {
