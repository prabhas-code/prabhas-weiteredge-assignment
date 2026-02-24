export default function Message({ message }) {
  const isUser = message.role === "user";

  const formattedTime = new Date(message.created_at).toLocaleTimeString();

  return (
    <div className={`message ${isUser ? "user" : "assistant"}`}>
      <div className="bubble">
        <p>{message.content}</p>
        <span className="timestamp">{formattedTime}</span>
      </div>
    </div>
  );
}
