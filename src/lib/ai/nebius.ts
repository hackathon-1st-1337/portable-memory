import "server-only";

export const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1";

/**
 * Nebius Token Factory Models
 * - Nemotron 3 Ultra for serious reasoning, synthesis, contradiction resolution
 * - Nemotron 3 Nano / Super for fast, responsive, everyday calls
 * - Qwen 3 Embedding 8B for high-precision semantic vector embeddings
 */
export const NEBIUS_MODELS = {
  /** 550B MoE Reasoning Engine for deep synthesis, planning, and contradictions */
  REASONING: "nvidia/Nemotron-3-Ultra-550b-a55b",
  /** Fast 30B everyday model for responsive classifications and summaries */
  FAST_NANO: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  /** 120B Super model for high-accuracy fast tasks */
  FAST_SUPER: "nvidia/nemotron-3-super-120b-a12b",
  /** Multilingual dense embedding model (supports MRL down to 1536 dims) */
  EMBEDDING: "Qwen/Qwen3-Embedding-8B",
} as const;

export interface NebiusEmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
}

export interface NebiusChatResult {
  text: string;
  reasoning?: string;
  model: string;
}

/**
 * Generate semantic vector embedding using Qwen/Qwen3-Embedding-8B on Nebius Token Factory.
 * By specifying dimensions: 1536, it utilizes Matryoshka Representation Learning (MRL)
 * to output normalized 1536-dimensional vectors matching Postgres pgvector(1536).
 */
export async function runNebiusEmbedding(
  text: string,
  options: {
    dimensions?: number;
    model?: string;
  } = {}
): Promise<NebiusEmbeddingResult | null> {
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) {
    return null;
  }

  const cleanText = text.trim();
  if (!cleanText) return null;

  const model = options.model || NEBIUS_MODELS.EMBEDDING;
  const dimensions = options.dimensions ?? 1536;

  try {
    const res = await fetch(`${NEBIUS_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: cleanText,
        dimensions,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        `Nebius Token Factory embedding error (${res.status} ${res.statusText}):`,
        errText.slice(0, 300)
      );
      return null;
    }

    const data = await res.json();
    const rawVector: number[] = data.data?.[0]?.embedding;

    if (!Array.isArray(rawVector) || rawVector.length === 0) {
      return null;
    }

    return {
      embedding: rawVector,
      model,
      dimensions: rawVector.length,
    };
  } catch (err) {
    console.error("Nebius Token Factory embedding request failed:", err);
    return null;
  }
}

/**
 * Execute chat completion with a Nemotron model on Nebius Token Factory.
 */
export async function runNebiusChat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<NebiusChatResult | null> {
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = options.model || NEBIUS_MODELS.FAST_NANO;

  try {
    const res = await fetch(`${NEBIUS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1500,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        `Nebius Token Factory chat error (${res.status} ${res.statusText}):`,
        errText.slice(0, 300)
      );
      return null;
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const message = choice?.message;

    // Handle reasoning and main content from Nemotron models
    const contentText = message?.content || "";
    const reasoningText = message?.reasoning_content || message?.reasoning || "";

    return {
      text: contentText.trim(),
      reasoning: reasoningText.trim(),
      model,
    };
  } catch (err) {
    console.error("Nebius Token Factory chat request failed:", err);
    return null;
  }
}

/**
 * Serious Reasoning: Routes to Nemotron 3 Ultra (550B) on Nebius Token Factory.
 * Used for deep memory consolidation ("Dreaming"), contradiction detection,
 * and knowledge graph synthesis.
 */
export async function runReasoning(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<NebiusChatResult | null> {
  return runNebiusChat(messages, {
    model: NEBIUS_MODELS.REASONING,
    temperature: options.temperature ?? 0.2,
    maxTokens: options.maxTokens ?? 2000,
  });
}

/**
 * Everyday Fast Call: Routes to Nemotron 3 Nano (or Super) on Nebius Token Factory.
 * Used for fast classification, procedure detection, query rewriting, and context summaries.
 */
export async function runEverydayCall(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: { useSuper?: boolean; temperature?: number; maxTokens?: number } = {}
): Promise<NebiusChatResult | null> {
  return runNebiusChat(messages, {
    model: options.useSuper ? NEBIUS_MODELS.FAST_SUPER : NEBIUS_MODELS.FAST_NANO,
    temperature: options.temperature ?? 0.1,
    maxTokens: options.maxTokens ?? 350,
  });
}

/**
 * Fast Procedure Detector: Analyzes text with Nemotron Nano to check if it represents
 * an operational procedure with an activation condition (e.g., "when doing X, do Y").
 */
export async function detectProcedure(
  text: string
): Promise<{ isProcedure: boolean; procedureWhen?: string }> {
  try {
    const res = await runEverydayCall(
      [
        {
          role: "system",
          content:
            'You are a memory classifier. If the text describes an operational procedure, rule, or action to take under a condition, return JSON: {"isProcedure": true, "procedureWhen": "<condition trigger>"}. Otherwise return {"isProcedure": false}. Return strictly valid JSON.',
        },
        { role: "user", content: text },
      ],
      { temperature: 0.1, maxTokens: 150 }
    );

    if (!res || !res.text) {
      return { isProcedure: false };
    }

    const cleaned = res.text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      isProcedure: Boolean(parsed.isProcedure),
      procedureWhen: parsed.procedureWhen || undefined,
    };
  } catch {
    return { isProcedure: false };
  }
}
