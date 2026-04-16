// ID документа Google Docs где хранится инструкция для бота
const GOOGLE_DOC_ID = "1wndDcMgXu0I9H679onoXNbLzTlEiBnOzvvtQ7UYU2z4";

// Токен Телеграм бота (берётся из секретных переменных Vercel)
const TG_TOKEN = process.env.TG_TOKEN;

// ID чата Телеграм куда слать историю переписки
const TG_CHAT = process.env.TG_CHAT;

// ФУНКЦИЯ 1: Загружает инструкцию из Google Docs
async function loadPrompt() {
  try {
    const url = `https://docs.google.com/document/d/${GOOGLE_DOC_ID}/export?format=txt`;
    const response = await fetch(url);
    if (!response.ok) return "Ты Катя, консультант car-branding.kz";
    let text = await response.text();
    text = text.trim();
    return text || "Ты Катя, консультант car-branding.kz";
  } catch (e) {
    return "Ты Катя, консультант car-branding.kz";
  }
}

// ФУНКЦИЯ 2: Отправляет историю чата в Телеграм
async function sendToTelegram(messages) {
  try {
    let text = "📋 История чата:\n\n";
    for (let msg of messages) {
      if (msg.role === "user") {
        text += `👤 Клиент: ${msg.content}\n\n`;
      } else {
        text += `🤖 Амина: ${msg.content}\n\n`;
      }
    }
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ chat_id: TG_CHAT, text: text })
    });
  } catch (e) {
    console.error("Telegram error:", e);
  }
}

// ГЛАВНАЯ ФУНКЦИЯ: Обрабатывает запросы от сайта
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "API Key не настроен" });

    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "Нет сообщений" });

    const systemPrompt = await loadPrompt();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
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
        choices: [{ message: { content: "Извините, попробуйте позже." } }]
      });
    }

    const botMessage = data.content?.[0]?.text || "Извините, не могу ответить.";
    await sendToTelegram([...messages, { role: "assistant", content: botMessage }]);
    res.status(200).json({ choices: [{ message: { content: botMessage } }] });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: "Server error",
      choices: [{ message: { content: "Ошибка сервера." } }]
    });
  }
};
