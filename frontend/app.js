let adminToken = null;
let config = null;
let history = [];

function loadAdminToken() {
  adminToken = localStorage.getItem("hai_admin_token") || null;
}

function saveAdminToken(token) {
  adminToken = token;
  if (token) {
    localStorage.setItem("hai_admin_token", token);
  } else {
    localStorage.removeItem("hai_admin_token");
  }
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

async function updateConfigOnServer(newCfg) {
  if (!adminToken) {
    throw new Error("Nicht eingeloggt.");
  }
  const res = await fetch("/api/config/update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Auth": adminToken,
    },
    body: JSON.stringify(newCfg),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Config-Update-Fehler: ${res.status} ${txt}`);
  }
  return await res.json();
}

function appendMessage(role, text) {
  const container = document.getElementById("messages");
  const el = document.createElement("div");
  el.className = `message ${role}`;
  el.textContent = text;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

async function sendChatMessage(messages, model) {
  const body = { messages };
  if (model) {
    body.model = model;
  }

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content
