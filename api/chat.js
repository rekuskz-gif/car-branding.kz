const GOOGLE_DOC_ID = "1wndDcMgXu0I9H679onoXNbLzTlEiBnOzvvtQ7UYU2z4";
const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT = process.env.TG_CHAT;

async function loadPrompt() {
  try {
    const url = `https://docs.google.com/document/d/${GOOGLE_DOC_ID}/export?format=txt`;
    const response = await fetch(url);
    if (!response.ok) return "";
    let text = await response.text();
    return text.trim();
  } catch (e) {
    return "";
  }
}

async function sendToTelegram(messages, apiKey) {
  try {
    let text = "📋 История чата:\n\n";
    for (let msg of messages) {
      if (msg.role === "user") text += `👤 Клиент: ${msg.content}\n\n`;
      else if (msg.role === "assistant") text += `🤖 Бот: ${msg.content}\n\n`;
    }
    text += `⏰ ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}`;

    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text: text })
    });

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

    // Сначала промпт — потом запрос
    const systemPrompt = await loadPrompt();

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
        system: systemPrompt,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      })
    });

    const mainData = await mainResponse.json();
    const botMessage = mainData.content?.[0]?.text || "Ошибка";

    // Отвечаем клиенту сразу
    res.status(200).json({ choices: [{ message: { content: botMessage } }] });

    // Телеграм в фоне без await
    sendToTelegram([...messages, { role: "assistant", content: botMessage }], apiKey);

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: "Server error",
      choices: [{ message: { content: "Ошибка сервера" } }]
    });
  }
};
