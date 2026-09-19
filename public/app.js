const connectForm = document.querySelector("#connectForm");
const askForm = document.querySelector("#askForm");
const siteUrl = document.querySelector("#siteUrl");
const question = document.querySelector("#question");
const messages = document.querySelector("#messages");
const sourceState = document.querySelector("#sourceState");
const sourceText = document.querySelector("#sourceText");
const connectionLabel = document.querySelector("#connectionLabel");
const statusPill = document.querySelector(".status-pill");

const addMessage = (label, text, type) => {
  if (messages.querySelector(".empty-state")) messages.innerHTML = "";
  const message = document.createElement("div");
  message.className = `message ${type}`;
  message.innerHTML = `<div class="message-label">${label}</div><div class="message-body"></div>`;
  message.querySelector(".message-body").textContent = text;
  messages.append(message);
  message.scrollIntoView({ behavior: "smooth", block: "nearest" });
};

connectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = siteUrl.value.trim();
  sourceState.classList.add("loading"); sourceText.textContent = "Reading the site...";
  try {
    const response = await fetch("/api/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: /^https?:\/\//i.test(url) ? url : `https://${url}` }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    sourceState.className = "source-state success"; sourceText.textContent = `${data.title} / ${data.words.toLocaleString()} words indexed`;
    connectionLabel.textContent = "Site connected"; statusPill.classList.add("connected"); question.disabled = false; document.querySelector("#askButton").disabled = false; question.focus();
    messages.innerHTML = `<div class="empty-state"><div class="empty-orbit">✦</div><p>${data.title} is ready.</p><span>Ask anything that page can answer.</span></div>`;
  } catch (error) { sourceState.className = "source-state"; sourceText.textContent = error.message; }
});

askForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = question.value.trim(); if (!text) return;
  addMessage("You", text, "user"); question.value = ""; question.disabled = true; document.querySelector("#askButton").disabled = true;
  addMessage("Site Sage", "Reading the source...", "assistant"); const pending = messages.lastElementChild.querySelector(".message-body");
  try { const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); pending.textContent = data.answer; }
  catch (error) { pending.textContent = error.message; }
  question.disabled = false; document.querySelector("#askButton").disabled = false; question.focus();
});