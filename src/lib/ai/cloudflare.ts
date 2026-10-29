import "server-only";

const CF_DEFAULT_EMBEDDING_MODEL = "@cf/baai/bge-m3";
const CF_DEFAULT_CHAT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";

export interface CloudflareEmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
}

/**
 * Run Cloudflare Workers AI embedding model (@cf/baai/bge-m3)
 */
export async function runCloudflareEmbedding(
  text: string,
  model: string = CF_DEFAULT_EMBEDDING_MODEL
): Promise<CloudflareEmbeddingResult | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    return null;
  }

  const cleanText = text.trim();
  if (!cleanText) return null;

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: cleanText,
        }),
      }
    );

    if (!res.ok) {
      console.error(
        `Cloudflare Workers AI embedding error: ${res.status} ${res.statusText}`
      );
      return null;
    }

    const data = await res.json();
    const rawVector: number[] = data.result?.data?.[0];

    if (!Array.isArray(rawVector) || rawVector.length === 0) {
      return null;
    }

    return {
      embedding: rawVector,
      model,
      dimensions: rawVector.length,
    };
  } catch (err) {
    console.error("Cloudflare Workers AI request failed:", err);
    return null;
  }
}

/**
 * Run Cloudflare Workers AI chat / text generation model (e.g. LLaMA 3.1 8B, DeepSeek R1, LLaMA 3.2 3B)
 */
export async function runCloudflareChat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<{ text: string; model: string } | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    return null;
  }

  const model = options.model || CF_DEFAULT_CHAT_MODEL;

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages,
          temperature: options.temperature,
          max_tokens: options.maxTokens,
        }),
      }
    );

    if (!res.ok) {
      console.error(
        `Cloudflare Workers AI chat error: ${res.status} ${res.statusText}`
      );
      return null;
    }

    const data = await res.json();
    const responseText =
      data.result?.response ??
      data.result?.choices?.[0]?.message?.content ??
      "";

    return {
      text: responseText,
      model,
    };
  } catch (err) {
    console.error("Cloudflare Workers AI chat request failed:", err);
    return null;
  }
}
