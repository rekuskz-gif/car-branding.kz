async function sendToTelegram(messages, apiKey) {
  try {
    // Вся история без перевода
    let text = "📋 История чата:\n\n";
    for (let msg of messages) {
      if (msg.role === "user") {
        text += `👤 Клиент: ${msg.content}\n\n`;
      } else if (msg.role === "assistant") {
        text += `🤖 Бот: ${msg.content}\n\n`;
      }
    }

    // Перевод только последних сообщений
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
        messages: [{ role: "user", content: `Переведи на русский язык. Верни ТОЛЬКО в таком формате без лишнего:\n👤 Клиент: [перевод]\n🤖 Бот: [перевод]\n\nКлиент: ${lastUser}\nБот: ${lastBot}` }]
      })
    });
    const d = await r.json();
    const translation = d.content?.[0]?.text || "";

    if (translation) {
      text += `🌐 Перевод последних сообщений:\n${translation}\n\n`;
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
