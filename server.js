import http from "node:http";
import net from "node:net";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3000);
let knowledge = null;

const send = (response, status, payload, type = "application/json") => {
  response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  response.end(type === "application/json" ? JSON.stringify(payload) : payload);
};

const cleanText = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
  .replace(/<\/?(p|div|section|article|header|footer|h[1-6]|li|br)[^>]*>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&#39;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/[ \t]+/g, " ")
  .replace(/\n\s*\n+/g, "\n")
  .trim();

const titleFrom = (html, url) => html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || new URL(url).hostname;

const questionTerms = (question) => {
  const words = question.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
  const intentTerms = {
    studied: ["education", "university", "college", "school", "degree", "bachelor", "master", "graduated"],
    study: ["education", "university", "college", "school", "degree", "bachelor", "master", "graduated"],
    education: ["university", "college", "school", "degree", "studied"],
    work: ["experience", "engineer", "position", "company", "employment"],
    worked: ["experience", "engineer", "position", "company", "employment"],
    projects: ["project", "built", "developed", "application", "system"],
    skills: ["technical", "programming", "framework", "language", "tools"]
  };
  return [...new Set([...words, ...words.flatMap((word) => intentTerms[word] || [])])];
};

const relevantPassages = (question, text) => {
  const terms = questionTerms(question);
  const chunks = text.split(/\n+/).map((chunk) => chunk.trim()).filter(Boolean);
  const fallbackChunks = chunks.length > 1 ? chunks : text.match(/.{1,500}(?:\s|$)/g) || [text];
  return fallbackChunks
    .map((chunk) => ({
      chunk,
      score: terms.filter((term) => new RegExp(`(^|[^a-z])${term}(?=$|[^a-z])`, "i").test(chunk)).length
    }))
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .slice(0, 3)
    .map((item) => item.chunk)
    .join(" ");
};

async function answerWithModel(question) {
  const context = relevantPassages(question, knowledge.text);
  if (!process.env.OPENAI_API_KEY) {
    return {
      answer: context ? `According to ${knowledge.title}:\n\n${context}` : "I could not find information to answer that question on this site.",
      mode: "local search"
    };
  }

  const modelResponse = await fetch(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Answer only from the supplied website context. If the answer is not present, say you could not find it on the site. Do not use unrelated context or guess. Keep answers concise and cite the source as the website title." },
        { role: "user", content: `Website: ${knowledge.url}\nTitle: ${knowledge.title}\nContext:\n${context}\n\nQuestion: ${question}` }
      ]
    })
  });
  if (!modelResponse.ok) throw new Error(`Model request failed (${modelResponse.status})`);
  const data = await modelResponse.json();
  return { answer: data.choices?.[0]?.message?.content || "The model returned an empty answer.", mode: "AI model" };
}

async function bodyOf(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || "{}");
}

const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    if (request.method === "GET" && pathname === "/api/status") {
      return send(response, 200, { connected: Boolean(knowledge), site: knowledge && { url: knowledge.url, title: knowledge.title, words: knowledge.text.split(/\s+/).length } });
    }
    if (request.method === "POST" && pathname === "/api/ingest") {
      const { url } = await bodyOf(request);
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("Please use an http or https URL.");
      const page = await fetch(parsed, { headers: { "User-Agent": "SiteSage/1.0 (website reader)" } });
      if (!page.ok) throw new Error(`The website returned ${page.status}.`);
      const html = await page.text();
      const text = cleanText(html);
      if (text.length < 80) throw new Error("That page did not contain enough readable text.");
      knowledge = { url: parsed.href, title: titleFrom(html, parsed.href), text };
      return send(response, 200, { url: knowledge.url, title: knowledge.title, words: text.split(/\s+/).length });
    }
    if (request.method === "POST" && pathname === "/api/ask") {
      if (!knowledge) return send(response, 400, { error: "Connect a website before asking a question." });
      const { question } = await bodyOf(request);
      if (!question?.trim()) return send(response, 400, { error: "Ask a question about the connected site." });
      return send(response, 200, await answerWithModel(question.trim()));
    }
    if (request.method === "GET") {
      const filePath = pathname === "/" ? join(root, "public/index.html") : join(root, "public", pathname);
      const content = await readFile(filePath);
      const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
      return send(response, 200, content, types[extname(filePath)] || "application/octet-stream");
    }
    send(response, 404, { error: "Not found" });
  } catch (error) {
    send(response, 400, { error: error.message || "Something went wrong." });
  }
});

const listenOnAvailablePort = (candidate) => {
  const probe = net.createServer();
  probe.once("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.warn(`Port ${candidate} is busy; trying ${candidate + 1}.`);
      listenOnAvailablePort(candidate + 1);
      return;
    }
    throw error;
  });
  probe.listen(candidate, () => {
    probe.close(() => server.listen(candidate, () => console.log(`Site Sage is running at http://localhost:${candidate}`)));
  });
};

listenOnAvailablePort(port);