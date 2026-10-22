import { Router } from "express";
import rateLimit from "express-rate-limit";
import Conversation from "../models/Conversation.js";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_CONTEXT_MESSAGES = 20;
const FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemma-4-26b-a4b-it",
];

async function generateReply({ apiKey, model, messages }) {
  if (!apiKey) {
    const error = new Error("AI chat is not configured. Add GEMINI_API_KEY to the server environment.");
    error.status = 503;
    throw error;
  }

  const contents = messages.map(({ role, content }) => ({
    role: role === "assistant" ? "model" : "user",
    parts: [{ text: content }],
  }));

  const configuredModels = String(model || "")
    .split(",")
    .map((item) => item.trim().replace(/^models\//, ""))
    .filter(Boolean);
  const candidateModels = [...new Set([...configuredModels, ...FALLBACK_MODELS])];

  let lastError = null;

  for (const candidateModel of candidateModels) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidateModel)}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: "You are a helpful, concise customer support assistant. Be friendly and clear. If you do not know an answer, say so and suggest contacting the support team." }],
            },
            contents,
            generationConfig: { maxOutputTokens: 700, temperature: 0.6 },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const error = new Error(errorBody?.error?.message || "The AI service could not answer right now.");
        error.status = response.status === 429 ? 429 : 502;
        lastError = error;
        continue;
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts
        ?.filter((part) => !part.thought)
        ?.map((part) => part.text || "")
        .join("")
        .trim();
      if (!text) {
        const error = new Error("The AI service returned an empty response. Please try again.");
        error.status = 502;
        lastError = error;
        continue;
      }
      return text;
    } catch (err) {
      const error = new Error(err?.message || "The AI service could not answer right now.");
      error.status = err?.status || 502;
      lastError = error;
    }
  }

  throw lastError || new Error("The AI service could not answer right now.");
}

export default function chatRoutes({ auth, geminiApiKey, geminiModel }) {
  const router = Router();
  const sendLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    keyGenerator: (req) => req.user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "You have sent several messages recently. Wait a minute and try again." },
  });

  router.get("/history", auth, async (req, res, next) => {
    try {
      const conversations = await Conversation.find({ userId: req.user.id })
        .sort({ updatedAt: -1 })
        .select("title updatedAt messages")
        .lean();
      return res.json({ conversations: conversations.map((conversation) => ({
        id: conversation._id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messages.length,
        preview: conversation.messages.at(-1)?.content || "",
      })) });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/history/:conversationId", auth, async (req, res, next) => {
    try {
      const conversation = await Conversation.findOne({ _id: req.params.conversationId, userId: req.user.id }).lean();
      if (!conversation) return res.status(404).json({ error: "Conversation not found." });
      return res.json({
        conversation: {
          id: conversation._id,
          title: conversation.title,
          updatedAt: conversation.updatedAt,
          messages: conversation.messages.map((message) => ({
            id: message._id,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
          })),
        },
      });
    } catch (error) {
      if (error?.name === "CastError") return res.status(404).json({ error: "Conversation not found." });
      return next(error);
    }
  });

  router.post("/send", auth, sendLimiter, async (req, res, next) => {
    try {
      const content = String(req.body?.message || "").trim();
      const conversationId = req.body?.conversationId;
      if (!content || content.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ error: `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters.` });
      }

      let conversation = null;
      if (conversationId) {
        conversation = await Conversation.findOne({ _id: conversationId, userId: req.user.id });
        if (!conversation) return res.status(404).json({ error: "Conversation not found." });
      }

      const context = conversation?.messages
        .slice(-MAX_CONTEXT_MESSAGES)
        .map(({ role, content: priorContent }) => ({ role, content: priorContent })) || [];
      context.push({ role: "user", content });
      const reply = await generateReply({ apiKey: geminiApiKey, model: geminiModel, messages: context });
      const now = new Date();

      if (!conversation) {
        conversation = new Conversation({
          userId: req.user.id,
          title: content.slice(0, 64),
          messages: [],
        });
      }
      conversation.messages.push(
        { role: "user", content, createdAt: now },
        { role: "assistant", content: reply, createdAt: new Date() },
      );
      conversation.updatedAt = new Date();
      await conversation.save();

      return res.json({
        conversationId: conversation.id,
        message: { role: "assistant", content: reply, createdAt: conversation.messages.at(-1).createdAt },
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
