
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();

const PORT = process.env.PORT || 10000;
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openrouter/free";

const ENABLE_GEMINI_SEARCH =
  process.env.ENABLE_GEMINI_SEARCH === "true";

const SYSTEM_PROMPT = `
Você é a Mobile IA, uma assistente virtual avançada.

Suas responsabilidades:
- Responder com clareza, inteligência e precisão.
- Conversar naturalmente em português do Brasil.
- Explicar assuntos difíceis de maneira simples.
- Ajudar com estudos, tecnologia, programação e criatividade.
- Analisar problemas passo a passo.
- Não inventar informações, fontes, notícias ou referências.
- Admitir quando não souber alguma coisa.
- Diferenciar fatos confirmados de opiniões e hipóteses.
- Quando houver pesquisa na internet, utilizar as fontes
  recebidas e informar suas referências.
- Nunca afirmar que pesquisou na internet quando não pesquisou.

Seja útil, respeitosa, objetiva e cuidadosa.
`;

app.set("trust proxy", 1);

app.use(cors());

app.use(express.json({
  limit: "32kb"
}));

app.use("/api/", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Muitas solicitações. Aguarde alguns minutos."
  }
}));

app.get("/", (_req, res) => {
  res.json({
    app: "Mobile IA API",
    status: "online",
    version: "2.0",
    message: "Servidor Mobile IA funcionando."
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    fallbackConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    webSearchEnabled: ENABLE_GEMINI_SEARCH
  });
});

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Envie uma lista de mensagens válida.");
  }

  if (messages.length > 30) {
    throw new Error("Envie no máximo 30 mensagens.");
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
      throw new Error("Uma das mensagens é inválida.");
    }

    const role =
      message.role === "assistant" ? "model" : "user";

    const text = message.content.trim();
    const previous = contents[contents.length - 1];

    if (previous && previous.role === role) {
      previous.parts.push({ text });
    } else {
      contents.push({
        role,
        parts: [{ text }]
      });
    }
  }

  while (contents.length && contents[0].role !== "user") {
    contents.shift();
  }

  if (!contents.length || contents[contents.length - 1].role !== "user") {
    throw new Error("A última mensagem precisa ser do usuário.");
  }

  return contents;
}

function normalizeOpenRouterMessages(messages) {
  return messages.map(message => ({
    role: message.role === "model" ? "assistant" : "user",
    content: message.parts.map(part => part.text).join("\n")
  }));
}

async function requestGemini(contents) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não configurada.");
  }

  const body = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    contents,
    generationConfig: {
      maxOutputTokens: 4096
    }
  };

  if (ENABLE_GEMINI_SEARCH) {
    body.tools = [{
      googleSearch: {}
    }];
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(GEMINI_MODEL) +
      ":generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000)
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data.error?.message || "Erro na API Gemini."
    );

    error.status = response.status;
    throw error;
  }

  const candidate = data.candidates?.[0];

  const reply = (candidate?.content?.parts || [])
    .filter(part => typeof part.text === "string")
    .map(part => part.text)
    .join("\n")
    .trim();

  if (!reply) {
    throw new Error("A Gemini não retornou uma resposta.");
  }

  const sources = [];
  const chunks =
    candidate?.groundingMetadata?.groundingChunks || [];

  for (const chunk of chunks) {
    const web = chunk.web;

    if (
      web &&
      typeof web.uri === "string" &&
      /^https?:\/\//i.test(web.uri)
    ) {
      if (!sources.some(source => source.url === web.uri)) {
        sources.push({
          title: web.title || "Fonte consultada",
          url: web.uri
        });
      }
    }
  }

  let finalReply = reply;

  if (sources.length > 0) {
    finalReply += "\n\nFontes consultadas:\n";

    finalReply += sources
      .slice(0, 8)
      .map(source => `- ${source.title}: ${source.url}`)
      .join("\n");
  }

  return {
    reply: finalReply,
    provider: "gemini",
    sources
  };
}

async function requestOpenRouter(messages) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY não configurada.");
  }

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mobileia-server.onrender.com",
        "X-Title": "Mobile IA"
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          ...normalizeOpenRouterMessages(messages)
        ],
        max_tokens: 3000
      }),
      signal: AbortSignal.timeout(45000)
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message || "Erro no serviço alternativo."
    );
  }

  const reply = data.choices?.[0]?.message?.content;

  const text = Array.isArray(reply)
    ? reply.map(item => item.text || "").join("\n").trim()
    : typeof reply === "string"
      ? reply.trim()
      : "";

  if (!text) {
    throw new Error("O serviço alternativo não retornou texto.");
  }

  return {
    reply: text,
    provider: "openrouter",
    sources: []
  };
}

app.post("/api/chat", async (req, res) => {
  let messages;

  try {
    messages = normalizeMessages(req.body?.messages);
  } catch (error) {
    return res.status(400).json({
      error: error.message
    });
  }

  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasFallback = Boolean(process.env.OPENROUTER_API_KEY);

  if (!hasGemini && !hasFallback) {
    return res.status(503).json({
      error: "Nenhum provedor de IA está configurado."
    });
  }

  if (hasGemini) {
    try {
      const result = await requestGemini(messages);
      return res.json(result);
    } catch (error) {
      console.error(
        "Falha na Gemini:",
        error.status || "",
        error.message
      );

      if (!hasFallback) {
        return res.status(502).json({
          error: "A IA principal não conseguiu responder. Tente novamente."
        });
      }
    }
  }

  if (hasFallback) {
    try {
      const result = await requestOpenRouter(messages);
      return res.json(result);
    } catch (error) {
      console.error("Falha no OpenRouter:", error.message);

      return res.status(502).json({
        error: "As IAs estão temporariamente indisponíveis."
      });
    }
  }

  return res.status(503).json({
    error: "Nenhum provedor de IA disponível."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Mobile IA API iniciada na porta " + PORT);
});
