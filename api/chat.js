<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Амина AI консультант</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Georgia, serif; background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .chat { width: 100%; max-width: 680px; background: rgba(255,255,255,0.05); border-radius: 24px; overflow: hidden; display: flex; flex-direction: column; height: 85vh; box-shadow: 0 8px 32px rgba(167,139,250,0.2); }
    .header { padding: 20px; display: flex; align-items: center; gap: 14px; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .avatar { width: 48px; height: 48px; border-radius: 50%; border: 2px solid #a78bfa; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .header-info { flex: 1; }
    .name { color: white; font-weight: bold; }
    .status { color: #a78bfa; font-size: 12px; }
    .messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
    .msg { max-width: 75%; padding: 12px 16px; border-radius: 16px; color: white; white-space: pre-wrap; line-height: 1.6; word-break: break-word; }
    .user { align-self: flex-end; background: linear-gradient(135deg, #7c3aed, #4f46e5); border-radius: 18px 18px 4px 18px; }
    .bot { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); border-radius: 18px 18px 18px 4px; }
    .msg a { color: #a78bfa; text-decoration: underline; cursor: pointer; }
    .msg a:hover { color: #c4b5fd; }
    .cursor { display: inline-block; width: 2px; height: 1.2em; background: #a78bfa; margin-left: 2px; animation: blink 0.7s infinite; vertical-align: text-bottom; }
    @keyframes blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
    .input-area { display: flex; gap: 10px; padding: 16px; border-top: 1px solid rgba(255,255,255,0.1); }
    textarea { flex: 1; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 10px 14px; color: white; font-size: 15px; resize: none; outline: none; font-family: inherit; min-height: 44px; }
    textarea::placeholder { color: rgba(255,255,255,0.3); }
    textarea:focus { border-color: rgba(167,139,250,0.5); }
    button { width: 46px; height: 46px; border: none; border-radius: 50%; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; cursor: pointer; font-size: 20px; }
    button:hover:not(:disabled) { transform: scale(1.05); }
    button:disabled { background: rgba(124,58,237,0.3); cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="chat">
    <div class="header">
      <div class="avatar">
        <img src="https://raw.githubusercontent.com/rekuskz-gif/amina-ai/main/amina-icon.png" alt="Амина">
      </div>
      <div class="header-info">
        <div class="name">Катя</div>
        <div class="status">🟢 онлайн!</div>
      </div>
    </div>
    <div id="messages" class="messages"></div>
    <div class="input-area">
      <textarea id="input" placeholder="Напишите..."></textarea>
      <button onclick="send()" id="sendBtn">↑</button>
    </div>
  </div>

  <script>
    let history = [];
    let loading = false;

    function linkify(text) {
      return text.replace(
        /(https?:\/\/[^\s]+)/g,
        '<a href="$1" target="_blank">$1</a>'
      );
    }

    function add(role, text) {
      const msg = document.createElement("div");
      msg.className = "msg " + role;
      msg.innerHTML = linkify(text);
      document.getElementById("messages").appendChild(msg);
      document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
    }

    async function typeMessage(text) {
      const msg = document.createElement("div");
      msg.className = "msg bot";
      const content = document.createElement("span");
      msg.appendChild(content);
      document.getElementById("messages").appendChild(msg);
      
      for (let i = 0; i < text.length; i++) {
        content.textContent += text[i];
        
        const cursor = document.createElement("span");
        cursor.className = "cursor";
        msg.appendChild(cursor);
        
        await new Promise(resolve => setTimeout(resolve, 20));
        document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
        
        cursor.remove();
      }
      
      // Парсим ссылки после печати
      content.innerHTML = linkify(content.textContent);
    }

    async function send() {
      const input = document.getElementById("input");
      const text = input.value.trim();
      if (!text || loading) return;

      loading = true;
      document.getElementById("sendBtn").disabled = true;
      input.value = "";
      add("user", text);
      history.push({role: "user", content: text});

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({messages: history})
        });

        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content || "Ошибка";

        history.push({role: "assistant", content: reply});
        await typeMessage(reply);
      } catch (e) {
        add("bot", "Ошибка соединения");
      }

      loading = false;
      document.getElementById("sendBtn").disabled = false;
    }

    document.getElementById("input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  </script>
</body>
</html>
