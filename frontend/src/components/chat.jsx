import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { sendMessage, fetchConversation } from "../api.js";
import Message from "./message.jsx";

export default function Chat() {
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef(null);

  useEffect(() => {
    let storedId = localStorage.getItem("sessionId");

    if (!storedId) {
      storedId = uuidv4();
      localStorage.setItem("sessionId", storedId);
    }

    setSessionId(storedId);
  }, []);

  useEffect(() => {
    if (sessionId) {
      loadConversation(sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversation = async (id) => {
    try {
      const res = await fetchConversation(id);

      console.log("RAW RESPONSE:", res);

      const safeMessages = Array.isArray(res)
        ? res
        : Array.isArray(res?.messages)
          ? res.messages
          : [];

      setMessages(safeMessages);
    } catch (err) {
      console.error(err);
      setMessages([]);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = {
      role: "user",
      content: input,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const data = await sendMessage(sessionId, input);

      const assistantMessage = {
        role: "assistant",
        content: data.reply,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      alert("Error sending message");
      console.log(err);
    }

    setLoading(false);
  };

  const handleNewChat = () => {
    const newId = uuidv4();
    localStorage.setItem("sessionId", newId);
    setSessionId(newId);
    setMessages([]);
  };

  return (
    <div className="chat-container">
      <button
        className="new-chat"
        onClick={handleNewChat}
        style={{ backgroundColor: "black", color: "white" }}
      >
        New Chat
      </button>

      <div className="messages">
        {messages.map((msg, index) => (
          <Message key={index} message={msg} />
        ))}

        {loading && <div className="loading">Assistant is typing...</div>}
        <div ref={bottomRef} />
      </div>

      <div className="input-area">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}
