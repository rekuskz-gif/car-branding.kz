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
        system: "Ты переводчик. Переводи текст на русский язык. Отвечай ТОЛЬКО переводом, без пояснений.",
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
        if (translation !== msg.content) {
          text += `🌐 Перевод: ${translation}\n`;
        }
        text += "\n";
      } else if (msg.role === "assistant") {
        const translation = await translateToRussian(msg.content, apiKey);
        text += `🤖 Катя: ${msg.content}\n`;
        if (translation !== msg.content) {
          text += `🌐 Перевод: ${translation}\n`;
        }
        text += "\n";
      }
    }
    
    text += `⏰ ${new Date().toLocaleString("ru-RU", {timeZone: "Asia/Almaty"})}`;
    
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ chat_id: TG_CHAT, text: text })
    });
  } catch (e) {
    console.error("Telegram error:", e);
  }
}
