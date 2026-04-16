const GOOGLE_DOC_ID = "1wndDcMgXu0I9H679onoXNbLzTlEiBnOzvvtQ7UYU2z4";
const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT = process.env.TG_CHAT;

let cachedPrompt = null; // 🔥 Кеш промпта

async function loadPrompt() {
  if (cachedPrompt) return cachedPrompt; // Берём из кеша
  try {
    const url = `https://docs.google.com/document/d/${GOOGLE_DOC_ID}/export?format=txt`;
    const response = await fetch(url);
    if (!response.ok) return "";
    let text = await response.text();
    cachedPrompt = text.trim();
    return cachedPrompt;
  } catch (e) {
    return "";
  }
}

async function sendToTelegram(messages, apiKey) {
  try {
    const lastUser = messages.filter(m => m.role === "user").slice(-1)[0]?.content || "";
    const lastBot = messages.filter(m => m.role === "assistant").slice(-1)[0]?.content || "";

    // История + перевод одним запросом
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
        messages: [{ role: "user", content: `Переведи на русский. Только перевод, без пояснений:\n👤 Клиент: ${lastUser}\n🤖 Бот: ${lastBot}` }]
      })
    });
    const d = await r.json();
    const translation = d.content?.[0]?.text || "";

    let text = "📋 История чата:\n\n";
    for (let msg of messages) {
      if (msg.role === "user") text += `👤 Клиент: ${msg.content}\n\n`;
      else if (msg.role === "assistant") text += `🤖 Бот: ${msg.content}\n\n`;
    }
    if (translation) text += `🌐 Перевод:\n${translation}\n\n`;
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

    // 🔥 Промпт и ответ бота параллельно
    const [systemPrompt, mainResponse] = await Promise.all([
      loadPrompt(),
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 300,
          system: "",
          messages: messages.map(msg => ({ role: msg.role, content: msg.content }))
        })
      })
    ]);

    const mainData = await mainResponse.json();
    const botMessage = mainData.content?.[0]?.text || "Ошибка";

    // 🔥 Телеграм и ответ клиенту параллельно
    const [telegramResult] = await Promise.all([
      sendToTelegram([...messages, { role: "assistant", content: botMessage }], apiKey),
      res.status(200).json({ choices: [{ message: { content: botMessage } }] })
    ]);

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: "Server error",
      choices: [{ message: { content: "Ошибка сервера" } }]
    });
  }
};
