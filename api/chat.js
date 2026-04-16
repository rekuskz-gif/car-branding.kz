const GOOGLE_DOC_ID = "1wndDcMgXu0I9H679onoXNbLzTlEiBnOzvvtQ7UYU2z4";
const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT = process.env.TG_CHAT;

const DEFAULT_PROMPT = `Ты Катя - AI консультант компании car-branding.kz.
Специалист по брендированию автомобилей.
Отвечай на том языке на котором пишет клиент.`;

async function loadPrompt() {
  try {
    const url = `https://docs.google.com/document/d/${GOOGLE_DOC_ID}/export?format=txt`;
    const response = await fetch(url);
    if (!response.ok) return DEFAULT_PROMPT;
    let text = await response.text();
    text = text.trim();
    console.log("PROMPT LENGTH:", text.length);
    return text || DEFAULT_PROMPT;
  } catch (e) {
    console.error("loadPrompt error:", e.message);
    return DEFAULT_PROMPT;
  }
}

async function translateToRussian(text, apiKey) {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 500,
        system: "Ты переводчик. Переводи текст на русский язык. Отвечай ТОЛЬКО переводом без пояснений. Если текст уже на русском - верни его без изменений.",
        messages: [{ role: "user", content: text }]
      })
    });
    const data = await response.json();
    return data.content?.[0]?.text || text;
  } catch (e) {
    return text;
  }
}

async function sendToTelegram(messages, apiKey) {
  try {
    let text = "📋 История чата Кати:\n\n";

    for (let msg of messages) {
      if (msg.role === "user") {
        const translation = await translateToRussian(msg.content, apiKey);
        text += `👤 Клиент: ${msg.content}\n`;
        if (translation.trim() !== msg.content.trim()) {
          text += `🌐 Перевод: ${translation}\n`;
        }
        text += "\n";
      } else if (msg.role === "assistant") {
        const translation = await translateToRussian(msg.content, apiKey);
        text += `🤖 Катя: ${msg.content}\n`;
        if (translation.trim() !== msg.content.trim()) {
          text += `🌐 Перевод: ${translation}\n`;
        }
        text += "\n";
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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 300,
        system: systemPrompt,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("API Error:", data);
      return res.status(response.status).json({
        error: data.error?.message || "API Error",
        choices: [{ message: { content: "Ошибка API" } }]
      });
    }

    const botMessage = data.content?.[0]?.text || "Ошибка";

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
