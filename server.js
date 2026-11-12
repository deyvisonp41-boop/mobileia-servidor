import express from "express";
import cors from "cors";
import OpenAI from "openai";
import rateLimit from "express-rate-limit";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "32kb" }));

// Limite básico contra excesso de chamadas durante os testes.
app.use("/api/", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Muitas solicitações. Aguarde alguns minutos e tente novamente." }
}));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.get("/", (_req, res) => {
  res.json({
    app: "Mobile IA API",
    status: "online",
    message: "Servidor funcionando."
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "A chave OPENAI_API_KEY não foi configurada no servidor."
      });
    }

    const { messages } = req.body ?? {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "Envie uma lista de mensagens no campo messages."
      });
    }

    if (messages.length > 30) {
      return res.status(400).json({
        error: "Envie no máximo 30 mensagens por solicitação."
      });
    }

    const validMessages = [];
    for (const message of messages) {
      if (
        !message ||
        !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" ||
        message.content.trim().length === 0 ||
        message.content.length > 8000
      ) {
        return res.status(400).json({
          error: "Cada mensagem precisa ter role user/assistant e texto válido de até 8.000 caracteres."
        });
      }

      validMessages.push({
        role: message.role,
        content: message.content.trim()
      });
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.5",
      instructions:
        "Você é a Mobile IA, uma assistente útil, clara, responsável e amigável. Responda em português do Brasil, a menos que o usuário peça outro idioma.",
      input: validMessages
    });

    return res.json({
      reply: response.output_text || "Não consegui gerar uma resposta em texto.",
      responseId: response.id
    });
  } catch (error) {
    console.error("Erro em /api/chat:", error?.message || error);

    if (error?.status === 401) {
      return res.status(502).json({
        error: "A OpenAI recusou a chave. Confira a variável OPENAI_API_KEY no Render."
      });
    }

    if (error?.status === 429) {
      return res.status(429).json({
        error: "Limite ou saldo da API atingido. Confira o uso e o faturamento da sua conta OpenAI."
      });
    }

    return res.status(500).json({
      error: "O servidor não conseguiu concluir a solicitação. Tente novamente."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Mobile IA API rodando na porta ${PORT}`);
});
