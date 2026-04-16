const GOOGLE_DOC_ID = "1wndDcMgXu0I9H679onoXNbLzTlEiBnOzvvtQ7UYU2z4";
const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT = process.env.TG_CHAT;

async function loadPrompt() {
  try {
    const url = `https://docs.google.com/document/d/${GOOGLE_DOC_ID}/export?format=txt`;
    const response = await fetch(url);
    if (!response.ok) return "";
    let text = await response.text();
    text = text.trim();
    console.log("PROMPT LENGTH:", text.length);
    return text;
  } catch (e) {
    console.error("loadPrompt error:", e.message);
    return "";
  }
}

async function translateRu(text, apiKey) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 200,
        messages: [{ role: "user", content: `Переведи на русский, только перевод, если уже русский верни как есть: ${text}` }]
      })
    });
    const d = await r.json();
    return d.content?.[0]?.text || text;
  } catch (e) {
    return text;
  }
}

async function sendToTelegram(messages, apiKey) {
  try {
    let text = "📋 История чата:\n\n";

    for (let msg of messages) {
      if (msg.role === "user") {
        const ru = await translateRu(msg.content, apiKey);
        text += `👤 Клиент: ${msg.content}\n`;
        text += `🌐 Перевод: ${ru}\n\n`;
      } else if (msg.role === "assistant") {
        const ru = await translateRu(msg.content, apiKey);
        text += `🤖 Бот: ${msg.content}\n`;
        text += `🌐 Перевод: ${ru}\n\n`;
      }
    }

    text += `⏰ ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}`;

    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text: text })
    });
  } catch (e) {
    console.error("Telegram error:", e);
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "API Key not configured" });

    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "Messages required" });

    const systemPrompt = await loadPrompt();

    const lastUserMessage = messages.filter(m => m.role === "user").slice(-1)[0]?.content || "";

    // Шаг 1: Анализ
    const analysisResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 200,
        system: "Ты аналитик. Проанализируй сообщение клиента кратко:\n1. На каком языке написано\n2. Что хочет клиент\n3. Какой тон у клиента\nОтвечай только на русском, кратко.",
        messages: [{ role: "user", content: lastUserMessage }]
      })
    });
    const analysisData = await analysisResponse.json();
    const analysis = analysisData.content?.[0]?.text || "";
    console.log("АНАЛИЗ:", analysis);

    // Шаг 2: Генерация ответа
    const fullSystem = `${systemPrompt}

--- АНАЛИЗ ПОСЛЕДНЕГО СООБЩЕНИЯ КЛИЕНТА ---
${analysis}
-------------------------------------------
Используй этот анализ чтобы дать точный ответ.`;

    const mainResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 300,
        system: fullSystem,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      })
    });
    const mainData = await mainResponse.json();
    const draftReply = mainData.content?.[0]?.text || "Ошибка";
    console.log("ЧЕРНОВИК:", draftReply);

    // Шаг 3: Проверка на галлюцинации
    const checkResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 300,
        system: `Ты проверяешь ответ бота на галлюцинации и ошибки.
Правила проверки:
- Бот не должен выдумывать цены, факты, гарантии
- Бот не должен упоминать: Claude, Anthropic, OpenAI, США
- Бот должен отвечать на том же языке что и клиент
- Ответ должен быть не более 45 слов

Если всё ок - верни ответ без изменений.
Если есть проблемы - исправь и верни исправленный ответ.
Верни ТОЛЬКО финальный текст ответа, без пояснений.`,
        messages: [{
          role: "user",
          content: `Язык клиента: ${analysis}\n\nОтвет бота:\n${draftReply}`
        }]
      })
    });
    const checkData = await checkResponse.json();
    const botMessage = checkData.content?.[0]?.text || draftReply;
    console.log("ФИНАЛ:", botMessage);

    // Отправляем в Телеграм с переводом
    await sendToTelegram([...messages, { role: "assistant", content: botMessage }], apiKey);

    res.status(200).json({ choices: [{ message: { content: botMessage } }] });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: "Server error",
      choices: [{ message: { content: "Ошибка сервера" } }]
    });
  }
};
