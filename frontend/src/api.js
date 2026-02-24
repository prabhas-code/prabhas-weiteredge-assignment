const BASE_URL = "http://localhost:5001/api";

export async function sendMessage(sessionId, message) {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId, message }),
  });

  if (!res.ok) throw new Error("Failed to send message");

  return res.json();
}

export async function fetchConversation(sessionId) {
  const res = await fetch(`${BASE_URL}/conversations/${sessionId}`);
  if (!res.ok) throw new Error("Failed to fetch conversation");
  return res.json();
}
