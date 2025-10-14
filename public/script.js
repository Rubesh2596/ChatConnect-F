// ======================
// CONFIG
// ======================
const API_URL = "http://localhost:3000"; // backend URL
const token = localStorage.getItem("chatconnect_token");
const user = JSON.parse(localStorage.getItem("chatconnect_user") || "{}");

// ======================
// CHAT PAGE LOGIC
// ======================
if (window.location.pathname.endsWith("chat.html")) {
  if (!token) {
    // not logged in → go back
    window.location.href = "index.html";
  }

  const socket = io(API_URL, { auth: { token } });
  const chatBox = document.getElementById("chatBox");
  const sendBtn = document.getElementById("sendBtn");
  const messageInput = document.getElementById("messageInput");
  const logoutBtn = document.getElementById("logoutBtn");

  // Load chat history
  async function loadMessages() {
    const res = await fetch(`${API_URL}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    chatBox.innerHTML = "";
    data.forEach(msg => {
      appendMessage(msg.username, msg.text, msg.timestamp);
    });
  }

function appendMessage(sender, text, time) {
  const div = document.createElement("div");
  div.className = "flex mb-2"; // flex container for alignment

  const isMe = sender === user.name; // check if the message is from logged-in user

  div.innerHTML = `
    <div class="${isMe ? 'ml-auto bg-blue-500 text-white' : 'mr-auto bg-gray-200 text-gray-800'} 
                px-3 py-2 rounded-lg max-w-xs break-words">
      <div class="text-sm font-bold">${sender}</div>
      <div>${text}</div>
      <div class="text-xs text-gray-300 mt-1 text-right">${new Date(time).toLocaleTimeString()}</div>
    </div>
  `;

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}


  // Receive real-time messages
  socket.on("chatMessage", (msg) => {
    appendMessage(msg.username, msg.text, msg.timestamp);
  });

  // Send message
  sendBtn.addEventListener("click", () => {
    const text = messageInput.value;
    if (text.trim() !== "") {
      socket.emit("chatMessage", { text, username: user.name });
      messageInput.value = "";
    }
  });

  // Enter key send
  messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      sendBtn.click();
    }
  });

  // Logout
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("chatconnect_token");
    localStorage.removeItem("chatconnect_user");
    window.location.href = "index.html";
  });

  loadMessages();
}
