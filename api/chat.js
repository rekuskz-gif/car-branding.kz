async function sendToTelegram(messages, apiKey) {
  try {
    let text = "📋 История чата:\n\n";
    for (let msg of messages) {
      if (msg.role === "user") {
        text += `👤 Клиент: ${msg.content}\n\n`;
      } else if (msg.role === "assistant") {
        text += `🤖 Бот: ${msg.content}\n\n`;
      }
    }
    text += `⏰ ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}`;

    // Переводим всю историю
    const translateResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `Переведи на русский язык только те строки которые не на русском. Формат оставь точно такой же. Верни весь текст целиком:\n\n${text}`
        }]
      })
    });
    const translateData = await translateResponse.json();
    const translatedText = translateData.content?.[0]?.text || text;

    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text: translatedText })
    });
  } catch (e) {
    console.error("Telegram error:", e);
  }
}
