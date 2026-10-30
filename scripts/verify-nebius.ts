import { generateEmbedding } from "../src/lib/memory/embeddings";
import {
  runNebiusEmbedding,
  runEverydayCall,
  runReasoning,
  detectProcedure,
  NEBIUS_MODELS,
} from "../src/lib/ai/nebius";

async function main() {
  console.log("=================================================");
  console.log("   NEBIUS TOKEN FACTORY INTEGRATION VERIFICATION ");
  console.log("=================================================\n");

  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) {
    console.error("❌ NEBIUS_API_KEY is not defined in environment!");
    process.exit(1);
  }
  console.log("🔑 NEBIUS_API_KEY detected:", apiKey.slice(0, 14) + "...\n");

  // 1. Qwen 3 Embedding 8B
  console.log("1. Testing Qwen 3 Embedding 8B (Matryoshka 1536-dim)...");
  const sampleText = "Portable Memory is a sovereign personal context store for all AI agents.";
  const embResult = await generateEmbedding(sampleText);

  console.log(`   Model reported: ${embResult.model}`);
  console.log(`   Vector dimensions: ${embResult.embedding.length}`);

  if (embResult.model.includes("Qwen") && embResult.embedding.length === 1536) {
    console.log("   ✓ Qwen embedding generated directly at native 1536 dimensions!\n");
  } else {
    throw new Error(`Unexpected embedding result: ${JSON.stringify(embResult.model)}`);
  }

  // 2. Nemotron 3 Nano (Everyday fast calls)
  console.log("2. Testing Nemotron 3 Nano (Everyday fast operations)...");
  const nanoStart = Date.now();
  const nanoResult = await runEverydayCall([
    {
      role: "system",
      content: "You are a concise AI assistant. Return a single sentence summary.",
    },
    {
      role: "user",
      content: "What is the primary benefit of portable memory for AI assistants?",
    },
  ]);
  const nanoDuration = Date.now() - nanoStart;

  if (!nanoResult || !nanoResult.text) {
    throw new Error("Nemotron Nano returned empty response");
  }
  console.log(`   Model: ${nanoResult.model} (${nanoDuration}ms)`);
  console.log(`   Output: "${nanoResult.text}"`);
  console.log("   ✓ Nemotron Nano fast everyday call succeeded!\n");

  // 3. Fast Procedure Detection (Nemotron Nano)
  console.log("3. Testing Fast Procedure Detection (Nemotron Nano)...");
  const procRule = "When deploying to production, always ensure all migrations have been applied.";
  const procResult = await detectProcedure(procRule);
  console.log("   Input:", procRule);
  console.log("   Detected Procedure:", procResult.isProcedure);
  console.log("   Trigger Condition:", procResult.procedureWhen);

  if (procResult.isProcedure && procResult.procedureWhen) {
    console.log("   ✓ Automatic procedure classification succeeded!\n");
  } else {
    throw new Error("Failed to detect procedure with Nemotron Nano");
  }

  // 4. Nemotron 3 Ultra (Serious Reasoning & Consolidation)
  console.log("4. Testing Nemotron 3 Ultra 550B (Serious Reasoning)...");
  const ultraStart = Date.now();
  const ultraResult = await runReasoning([
    {
      role: "system",
      content:
        'You are an expert memory synthesis engine. Find contradictions or connections and output JSON: [{"type": "contradiction"|"merge"|"graph", "rationale": "..."}]. Output JSON only.',
    },
    {
      role: "user",
      content:
        '[#1] "Prefers tea over coffee and never drinks caffeine after noon"\n[#2] "Always drinks a double espresso at 4 PM to stay awake"',
    },
  ]);
  const ultraDuration = Date.now() - ultraStart;

  if (!ultraResult || !ultraResult.text) {
    throw new Error("Nemotron Ultra returned empty response");
  }
  console.log(`   Model: ${ultraResult.model} (${ultraDuration}ms)`);
  console.log(`   Output: ${ultraResult.text.slice(0, 150)}...`);
  console.log("   ✓ Nemotron 3 Ultra serious reasoning succeeded!\n");

  console.log("=================================================");
  console.log("   ✨ ALL NEBIUS TOKEN FACTORY CHECKS PASSED!     ");
  console.log("=================================================");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
