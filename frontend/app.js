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

document.addEventListener("DOMContentLoaded", async () => {
  const backendInfo = document.getElementById("backendInfo");
  const chatBackendName = document.getElementById("chatBackendName");
  const chatBackendUrl = document.getElementById("chatBackendUrl");
  const imageBackendName = document.getElementById("imageBackendName");
  const imageBackendUrl = document.getElementById("imageBackendUrl");
  const mcpStatus = document.getElementById("mcpStatus");

  const userInput = document.getElementById("userInput");
  const chatForm = document.getElementById("chatForm");
  const settingsButton = document.getElementById("settingsButton");
  const settingsModal = document.getElementById("settingsModal");
  const closeSettings = document.getElementById("closeSettings");

  // Config laden
  const cfg = await fetchConfig();
  if (cfg) {
    chatBackendName.textContent = cfg.chat?.name || "nicht gesetzt";
    chatBackendUrl.textContent = cfg.chat?.base_url || "";
    imageBackendName.textContent = cfg.image?.name || "nicht gesetzt";
    imageBackendUrl.textContent = cfg.image?.base_url || "";
    mcpStatus.textContent = cfg.mcp?.enabled ? `aktiv (${cfg.mcp.base_url || ""})` : "inaktiv";
  } else {
    backendInfo.textContent = "Konfiguration konnte nicht geladen werden (siehe Browser-Konsole).";
  }

  // Textarea Auto-Resize
  userInput.addEventListener("input", () => autoResizeTextarea(userInput));

  // Chat-Form (noch ohne echten LLM-Call – Placeholder)
  chatForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const text = userInput.value.trim();
    if (!text) return;
    appendMessage("user", text);
    userInput.value = "";
    autoResizeTextarea(userInput);

    // Placeholder-Assistent
    appendMessage(
      "assistant",
      "Antwort kommt später von deinem konfigurierten LLM-Backend.\n\n(Backend-Endpunkt /api/chat ist noch zu verdrahten.)"
    );
  });

  // Settings-Modal
  settingsButton.addEventListener("click", () => {
    settingsModal.classList.remove("hidden");
  });
  closeSettings.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
  });
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.add("hidden");
    }
  });
});
