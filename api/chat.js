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

async function sendToTelegram(messages, apiKey) {
  try {
    // Сообщение 1 — история оригинал
    let text = "📋 История чата:\n\n";
    for (let msg of messages) {
      if (msg.role === "user") {
        text += `👤 Клиент: ${msg.content}\n\n`;
      } else if (msg.role === "assistant") {
        text += `🤖 Бот: ${msg.content}\n\n`;
      }
    }
    text += `⏰ ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}`;

    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text: text })
    });

    // Сообщение 2 — перевод последних сообщений
    const lastUser = messages.filter(m => m.role === "user").slice(-1)[0]?.content || "";
    const lastBot = messages.filter(m => m.role === "assistant").slice(-1)[0]?.content || "";

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 300,
        messages: [{ role: "user", content: `Переведи на русский. Формат:\n👤 Клиент: [перевод]\n🤖 Бот: [перевод]\n\nКлиент: ${lastUser}\nБот: ${lastBot}` }]
      })
    });
    const d = await r.json();
    const translation = d.content?.[0]?.text || "";

    if (translation) {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TG_CHAT, text: `🌐 Перевод:\n\n${translation}` })
      });
    }

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
    const botMessage = mainData.content?.[0]?.text || "Ошибка";
    console.log("ОТВЕТ:", botMessage);

    // Отправляем в Телеграм оригинал + перевод
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
