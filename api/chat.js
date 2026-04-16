// ID документа Google Docs где хранится инструкция для бота
const GOOGLE_DOC_ID = "1wndDcMgXu0I9H679onoXNbLzTlEiBnOzvvtQ7UYU2z4";

// Токен Телеграм бота (берётся из секретных переменных сервера)
const TG_TOKEN = process.env.TG_TOKEN;

// ID чата Телеграм куда слать историю переписки
const TG_CHAT = process.env.TG_CHAT;

// ========== ФУНКЦИЯ 1: Загрузка инструкции из Google Docs ==========
async function loadPrompt() {
  try {
    // Создаём ссылку для скачивания документа в виде текста
    const url = `https://docs.google.com/document/d/${GOOGLE_DOC_ID}/export?format=txt`;
    
    // Делаем запрос к Google Docs
    const response = await fetch(url);
    
    // Если Google Docs не ответил — используем запасной текст
    if (!response.ok) {
      return "Ты Катя, консультант"; // запасной вариант
    }
    
    // Читаем текст из ответа
    let text = await response.text();
    
    // Убираем лишние пробелы в начале и конце
    text = text.trim();
    
    // Если текст не пустой — возвращаем его, иначе запасной вариант
    return text || "Ты Катя, консультантz";
    
  } catch (e) {
    // Если вообще что-то сломалось — возвращаем запасной текст
    return "Ты Катя, консультант";
  }
}

// ========== ФУНКЦИЯ 2: Отправка истории чата в Телеграм ==========
async function sendToTelegram(messages) {
  try {
    // Начинаем собирать текст сообщения
    let text = "📋 История чата Катя:\n\n";
    
    // Перебираем все сообщения в чате
    for (let msg of messages) {
      if (msg.role === "user") {
        // Если сообщение от пользователя — добавляем с иконкой клиента
        text += `👤 Клиент: ${msg.content}\n\n`;
      } else {
        // Если сообщение от бота — добавляем с иконкой бота
        text += `🤖 Амина: ${msg.content}\n\n`;
      }
    }
    
    // Отправляем собранный текст в Телеграм
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        chat_id: TG_CHAT, // куда отправить
        text: text        // что отправить
      })
    });
  } catch (e) {
    // Если Телеграм не ответил — просто пишем ошибку в лог
    console.error("Telegram error:", e);
  }
}

// ========== ГЛАВНАЯ ФУНКЦИЯ: Обрабатывает запросы от чат-бота ==========
module.exports = async (req, res) => {

  // Разрешаем запросы с любого сайта (защита от блокировки браузера)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  // Если браузер спрашивает "можно ли слать запросы?" — говорим да
  if (req.method === "OPTIONS") return res.status(200).end();
  
  // Если пришёл не POST запрос — отказываем
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  try {
    // Берём API ключ Claude из секретных переменных
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    // Если ключа нет — возвращаем ошибку
    if (!apiKey) return res.status(500).json({ error: "API Key not configured" });
    
    // Берём историю сообщений из запроса
    const { messages } = req.body;
    
    // Если сообщений нет — возвращаем ошибку
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "Messages required" });
    
    // Загружаем инструкцию для бота из Google Docs
    const systemPrompt = await loadPrompt();
    
    // Отправляем запрос к Claude AI
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,           // наш ключ
        "anthropic-version": "2023-06-01", // версия API
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5", // какую модель использовать
        max_tokens: 300,           // максимум 300 слов в ответе
        system: systemPrompt,      // инструкция для бота
        messages: messages.map(msg => ({
          role: msg.role,       // кто писал: user или assistant
          content: msg.content  // текст сообщения
        }))
      })
    });
    
    // Читаем ответ от Claude
    const data = await response.json();
    
    // Если Claude вернул ошибку — передаём её дальше
    if (!response.ok) {
      console.error("API Error:", data);
      return res.status(response.status).json({
        error: data.error?.message || "API Error",
        choices: [{message: {content: "Ошибка API"}}] // это видит пользователь
      });
    }
    
    // Достаём текст ответа из ответа Claude
    const botMessage = data.content?.[0]?.text || "Ошибка";
    
    // Отправляем историю чата в Телеграм
    await sendToTelegram(messages);
    
    // Отправляем ответ бота обратно на сайт
    res.status(200).json({ choices: [{message: {content: botMessage}}] });

  } catch (error) {
    // Если что-то совсем сломалось — пишем в лог и отвечаем ошибкой
    console.error("Error:", error);
    res.status(500).json({
      error: "Server error",
      choices: [{message: {content: "Ошибка сервера"}}]
    });
  }
};
