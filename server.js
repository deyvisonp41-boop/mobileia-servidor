
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();
const PORT = process.env.PORT || 10000;
const GEMINI_MODEL = "gemini-2.5-flash";

app.use(cors());
app.use(express.json({ limit: "32kb" }));

app.use("/api/", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Muitas solicitações. Aguarde alguns minutos e tente novamente."
  }
}));

app.get("/", (_req, res) => {
  res.json({
    app: "Mobile IA API",
    status: "online",
    message: "Servidor funcionando com Gemini."
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/chat", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "A variável GEMINI_API_KEY não foi configurada no Render."
      });
    }

    const { messages } = req.body ?? {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "Envie uma lista de mensagens válida."
      });
    }

    if (messages.length > 30) {
      return res.status(400).json({
        error: "Envie no máximo 30 mensagens por solicitação."
      });
    }

    const contents = [];

    for (const message of messages) {
      if (
        !message ||
        !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" ||
        message.content.trim().length === 0 ||
        message.content.length > 8000
      ) {
        return res.status(400).json({
          error: "Mensagem inválida. Confira o conteúdo enviado."
        });
      }

      contents.push({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content.trim() }]
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      GEMINI_MODEL + ":generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text:
                "Você é a Mobile IA, uma assistente útil, inteligente, " +
                "clara, responsável e amigável. Responda em português " +
                "do Brasil, a menos que o usuário peça outro idioma."
            }]
          },
          contents: contents,
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 2048
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro da Gemini:", data.error?.message || response.status);

      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({
          error: "A Gemini recusou a chave. Confira GEMINI_API_KEY no Render."
        });
      }

      if (response.status === 429) {
        return res.status(429).json({
          error: "Limite gratuito da Gemini atingido. Aguarde e tente novamente."
        });
      }

      return res.status(502).json({
        error: "A Gemini não conseguiu processar a solicitação. Código: " +
          response.status
      });
    }

    const parts = data.candidates?.[0]?.content?.parts || [];

    const reply = parts
      .filter(part => typeof part.text === "string")
      .map(part => part.text)
      .join("\n")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "A Gemini não retornou uma resposta em texto."
      });
    }

    return res.json({
      reply: reply,
      model: GEMINI_MODEL
    });

  } catch (error) {
    console.error("Erro em /api/chat:", error?.message || error);

    return res.status(500).json({
      error: "Erro interno no servidor. Tente novamente."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Mobile IA API com Gemini rodando na porta " + PORT);
});
