// ============================================================
// КОНФИГУРАЦИЯ
// ============================================================
const GOOGLE_DOC_ID = "1wndDcMgXu0I9H679onoXNbLzTlEiBnOzvvtQ7UYU2z4"; // ID Google Doc с системным промптом
const TG_TOKEN = process.env.TG_TOKEN;   // Токен Telegram бота
const TG_CHAT = process.env.TG_CHAT;     // ID чата куда слать историю

// ============================================================
// ЗАГРУЗКА СИСТЕМНОГО ПРОМПТА ИЗ GOOGLE DOC
// ============================================================
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
    return ""; // если не удалось загрузить — бот работает без системного промпта
  }
}

// ============================================================
// ОТПРАВКА ИСТОРИИ ЧАТА В TELEGRAM
// Отправляет 2 сообщения:
//   1. Полная история чата
//   2. Перевод последнего обмена на русский (через Claude)
// ============================================================
async function sendToTelegram(messages, apiKey) {
  try {
    // --- Формируем и отправляем полную историю чата ---
    let text = "📋 История чата:\n\n";
    for (let msg of messages) {
      if (msg.role === "user") {
        text += `👤 Клиент: ${msg.content}\n\n`;
      } else if (msg.role === "assistant") {
        text += `🤖 Бот: ${msg.content}\n\n`;
      }
    }
    text += `⏰ ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}`; // время по Алматы

    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text: text })
    });

    // --- Берём последние сообщения для перевода ---
    const lastUser = messages.filter(m => m.role === "user").slice(-1)[0]?.content || "";
    const lastBot = messages.filter(m => m.role === "assistant").slice(-1)[0]?.content || "";

    // --- Запрос к Claude для перевода последнего обмена на русский ---
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

    // --- Отправляем перевод в Telegram если он есть ---
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

// ============================================================
// ГЛАВНЫЙ ОБРАБОТЧИК ЗАПРОСОВ
// ============================================================
module.exports = async (req, res) => {

  // --- CORS заголовки — разрешаем запросы с любого домена ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // --- Обработка preflight запроса от браузера ---
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  try {
    // --- Проверяем наличие API ключа ---
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "API Key not configured" });

    // --- Проверяем что messages переданы и это массив ---
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "Messages required" });

    // --- Загружаем системный промпт из Google Doc ---
    const systemPrompt = await loadPrompt();

    // --- Основной запрос к Claude — генерация ответа бота ---
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

    // --- Отправляем ответ клиенту ---
    res.status(200).json({ choices: [{ message: { content: botMessage } }] });

    // --- Логируем историю в Telegram (fire-and-forget — не блокирует ответ) ---
    sendToTelegram([...messages, { role: "assistant", content: botMessage }], apiKey);

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: "Server error",
      choices: [{ message: { content: "Ошибка сервера" } }]
    });
  }
};
