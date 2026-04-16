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

    // Отправляем сначала без перевода — чтоб не было timeout
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text: text })
    });

    // Потом отдельным сообщением — перевод последнего ответа бота
    const lastBot = messages.filter(m => m.role === "assistant").slice(-1)[0]?.content;
    const lastUser = messages.filter(m => m.role === "user").slice(-1)[0]?.content;

    if (lastBot || lastUser) {
      const toTranslate = `Клиент написал: ${lastUser}\nБот ответил: ${lastBot}`;
      const translateResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 300,
          messages: [{
            role: "user",
            content: `Переведи на русский язык. Верни ТОЛЬКО перевод в формате:\n👤 Клиент: [перевод]\n🤖 Бот: [перевод]\n\n${toTranslate}`
          }]
        })
      });
      const translateData = await translateResponse.json();
      const translation = translateData.content?.[0]?.text;
      if (translation) {
        await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: TG_CHAT, text: `🌐 Перевод:\n\n${translation}` })
        });
      }
    }

  } catch (e) {
    console.error("Telegram error:", e);
  }
}
