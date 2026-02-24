import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDb } from "./db.js";
import fs from "fs";

// ─── Gemini Setup ─────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash", // stable & cheaper than preview
});


const docs = JSON.parse(
  fs.readFileSync(new URL("./docs.json", import.meta.url)),
);

const app = express();
const PORT = process.env.PORT || 5001;

// ─── Middleware 
app.use(cors({ origin: "*" }));
app.use(express.json());

app.use(
  "/api/",
  rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: {
      error: "Too many requests. Please wait a moment before trying again.",
    },
  }),
);



function getRecentHistory(sessionId, pairCount = 5) {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT role, content FROM messages
       WHERE session_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(sessionId, pairCount * 2);

  return rows.reverse();
}

const NOT_FOUND_REPLY = "Sorry, I don't have information about that.";

function validateResponse(reply) {
  const normalized = reply.trim().toLowerCase();

  if (normalized === NOT_FOUND_REPLY.toLowerCase()) {
    return NOT_FOUND_REPLY;
  }

  const allDocText = docs.map((d) => d.content.toLowerCase()).join(" ");

  const replyWords = normalized.split(/\s+/).filter((w) => w.length > 4);
  const docWords = new Set(allDocText.split(/\s+/).filter((w) => w.length > 4));

  const matchCount = replyWords.filter((w) => docWords.has(w)).length;
  const ratio = replyWords.length > 0 ? matchCount / replyWords.length : 0;

  if (ratio < 0.15 && replyWords.length > 5) {
    return NOT_FOUND_REPLY;
  }

  return reply.trim();
}

// Routes

app.post("/api/chat", async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({
      error: "Missing sessionId or message.",
    });
  }

  const db = getDb();

  try {
    // Ensure session exists
    const session = db
      .prepare("SELECT id FROM sessions WHERE id = ?")
      .get(sessionId);

    if (!session) {
      db.prepare(
        `INSERT INTO sessions (id, created_at, updated_at)
         VALUES (?, datetime('now'), datetime('now'))`,
      ).run(sessionId);
    }

    // Save user message
    db.prepare(
      `INSERT INTO messages (session_id, role, content, created_at)
       VALUES (?, 'user', ?, datetime('now'))`,
    ).run(sessionId, message.trim());

    //Get last 5 pairs 
    const history = getRecentHistory(sessionId);
    const historyText = history.length
      ? history
          .map(
            (m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`,
          )
          .join("\n")
      : "No previous conversation.";

    // ─── 🔥 TOKEN OPTIMIZATION: Only send relevant doc ─────────
    const matchedDoc = docs.find((d) =>
      message.toLowerCase().includes(d.title.toLowerCase()),
    );

    const relevantDocs = matchedDoc
      ? `### ${matchedDoc.title}\n${matchedDoc.content}`
      : docs.map((d) => `### ${d.title}\n${d.content}`).join("\n\n");

    // Prompt
    const prompt = `
You are a customer support assistant.

STRICT RULES:
- Only answer using the documentation below.
- If the answer is not found, respond EXACTLY with:
"${NOT_FOUND_REPLY}"
- Do not guess.
- Do not use external knowledge.

Documentation:
${relevantDocs}

Conversation History:
${historyText}

Current Question:
${message}

Answer:
`;

    
    const result = await model.generateContent(prompt);

    const rawReply =
      result.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      NOT_FOUND_REPLY;

    const tokensUsed = result.response?.usageMetadata?.totalTokenCount || 0;

    const validatedReply = validateResponse(rawReply);

    // Save assistant message
    db.prepare(
      `INSERT INTO messages (session_id, role, content, created_at)
       VALUES (?, 'assistant', ?, datetime('now'))`,
    ).run(sessionId, validatedReply);

    db.prepare(
      `UPDATE sessions SET updated_at = datetime('now') WHERE id = ?`,
    ).run(sessionId);

    return res.json({
      reply: validatedReply,
      tokensUsed,
    });
  } catch (err) {
    console.error("Gemini Error:", err);

    if (err?.status === 401) {
      return res.status(502).json({
        error: "Invalid Gemini API key.",
      });
    }

    return res.status(500).json({
      error: "LLM processing failed.",
    });
  }
});

// ─── Other Routes

app.get("/api/conversations/:sessionId", (req, res) => {
  const db = getDb();

  try {
    const messages = db
      .prepare(
        `SELECT id, session_id, role, content, created_at
         FROM messages
         WHERE session_id = ?
         ORDER BY created_at ASC, id ASC`,
      )
      .all(req.params.sessionId);

    res.json({ messages });
  } catch {
    res.status(500).json({ error: "Database error." });
  }
});

app.get("/api/sessions", (req, res) => {
  const db = getDb();

  try {
    const sessions = db
      .prepare(
        `SELECT id, created_at, updated_at
         FROM sessions
         ORDER BY updated_at DESC`,
      )
      .all();

    res.json({ sessions });
  } catch {
    res.status(500).json({ error: "Database error." });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(
    `✅ Support Assistant backend running on http://localhost:${PORT}`,
  );
  getDb();
});
