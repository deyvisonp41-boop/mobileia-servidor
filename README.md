# Mobile IA — servidor

Servidor Node.js/Express que conecta a interface Mobile IA à API Responses da OpenAI.

## Arquivos

- `server.js`: servidor e rota `/api/chat`.
- `package.json`: dependências e comando de inicialização.
- `.env.example`: exemplo sem chave real.
- `.gitignore`: impede enviar `.env` e `node_modules`.

## Publicar no Render

1. Envie esta pasta para um repositório GitHub.
2. No Render, escolha **New → Web Service** e conecte o repositório.
3. Runtime: **Node**.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Crie as variáveis `OPENAI_API_KEY` e `OPENAI_MODEL` na aba **Environment**.
7. Faça o deploy.

## Variáveis

- `OPENAI_API_KEY`: chave secreta criada na plataforma da OpenAI.
- `OPENAI_MODEL`: modelo da API. O padrão neste projeto é `gpt-5.5`.
- `PORT`: definido automaticamente pelo Render.

## Teste

Abra `https://SEU-SERVICO.onrender.com/health`. Deve retornar:

`{"status":"ok"}`

A rota de chat recebe JSON neste formato:

```json
{
  "messages": [
    { "role": "user", "content": "Oi! Quem é você?" }
  ]
}
```

Endpoint: `POST https://SEU-SERVICO.onrender.com/api/chat`

A resposta terá o formato:

```json
{
  "reply": "Resposta da assistente",
  "responseId": "..."
}
```

## Segurança

- Não coloque a chave real em `index.html`, JavaScript do navegador, GitHub ou mensagens públicas.
- Configure a chave somente em **Render → seu serviço → Environment**.
- Este é um ponto de partida para testes. Há um limite básico de 20 chamadas por IP a cada 15 minutos, mas ele não substitui autenticação. Antes de disponibilizar publicamente, adicione autenticação de usuários, limites de uso por usuário e proteção adicional contra abuso. CORS não substitui autenticação.
- O uso da API é cobrado separadamente da assinatura ChatGPT, conforme o consumo e o faturamento da conta API.
