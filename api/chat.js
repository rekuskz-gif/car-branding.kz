// 📌 ЗАГРУЖАЕМ ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ
require('dotenv').config();

// Используем переменные окружения
const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT = process.env.TG_CHAT;

async function loadPrompt() {
  try {
    const url = `https://docs.google.com/document/d/1wndDcMgXu0I9H679onoXNbLzTlEiBnOzvvtQ7UYU2z4/export?format=txt`;
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });
    if (!response.ok) {
      console.log("Google Doc fetch failed:", response.status);
      return "Ты Катя, AI консультант car-branding.kz";
    }
    const text = (await response.text()).trim();
    console.log("Prompt loaded, length:", text.length);
    return text || "Ты Катя, AI консультант car-branding.kz";
  } catch (e) {
    console.error("loadPrompt error:", e.message);
    return "Ты Катя, AI консультант car-branding.kz";
  }
}

async function sendToTelegram(messages) {
  try {
    let text = "📋 Чат с Катей (car-branding.kz):\n\n";
    for (const msg of messages) {
      if (msg.role === "user") {
        text += `👤 Клиент: ${msg.content}\n\n`;
      } else {
        text += `🤖 Катя: ${msg.content}\n\n`;
      }
    }
    if (text.length > 4096) {
      text = text.substring(0, 4090) + "...";
    }
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text })
    });
  } catch (e) {
    console.error("Telegram error:", e.message);
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
    if (!apiKey) return res.status(500).json({ error: "No API key" });
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages required" });
    }
    const systemPrompt = await loadPrompt();
    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system: systemPrompt,
        messages: messages.map(({ role, content }) => ({ role, content }))
      })
    });
    const data = await aiResponse.json();
    if (!aiResponse.ok) {
      console.error("Claude API error:", data);
      return res.status(aiResponse.status).json({
        error: data.error?.message || "API Error",
        choices: [{ message: { content: "Ошибка API. Попробуйте позже." } }]
      });
    }
    const botMessage = data.content?.[0]?.text || "Ошибка";
    if (messages.length % 3 === 0) {
      await sendToTelegram([...messages, { role: "assistant", content: botMessage }]);
    }
    return res.status(200).json({ choices: [{ message: { content: botMessage } }] });
  } catch (error) {
    console.error("Server error:", error.message);
    return res.status(500).json({
      error: "Server error",
      choices: [{ message: { content: "Ошибка сервера. Попробуйте позже." } }]
    });
  }
};
