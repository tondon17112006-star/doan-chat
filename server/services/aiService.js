import { env } from "../config/env.js";

export async function generateAiReply(message) {
  if (env.ai.baseUrl && env.ai.apiKey && env.ai.model) {
    try {
      const response = await fetch(`${env.ai.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.ai.apiKey}` },
        body: JSON.stringify({
          model: env.ai.model,
          messages: [
            { role: "system", content: "You are Lumina, a concise and friendly assistant inside a chat application." },
            { role: "user", content: message },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch {
      // Keep the chat usable when the optional AI provider is unavailable.
    }
  }
  return `I received your message: “${String(message || "").slice(0, 180)}”. Configure AI_BASE_URL, AI_API_KEY and AI_MODEL to enable generated replies.`;
}
