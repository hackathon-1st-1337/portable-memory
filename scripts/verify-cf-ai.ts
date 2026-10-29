import { generateEmbedding } from "../src/lib/memory/embeddings";
import { runCloudflareChat } from "../src/lib/ai/cloudflare";

async function main() {
  console.log("\n⚡ Testing Cloudflare Workers AI Integration...\n");

  // 1. Embedding
  console.log("1. Generating embedding for 'Portable Memory is sovereign AI memory'...");
  const embResult = await generateEmbedding("Portable Memory is sovereign AI memory");
  console.log(`   Model used: ${embResult.model}`);
  console.log(`   Embedding dimensions: ${embResult.embedding.length}`);
  console.log(`   Sample values: [${embResult.embedding.slice(0, 5).join(", ")}...]`);

  if (embResult.model.startsWith("cloudflare:") && embResult.embedding.length === 1536) {
    console.log("   ✓ Cloudflare embedding generated and padded to 1536 dims successfully!");
  } else {
    console.error("   ✗ Cloudflare embedding failed!");
    process.exit(1);
  }

  // 2. Chat / Completion
  console.log("\n2. Testing Cloudflare LLM inference (@cf/meta/llama-3.1-8b-instruct-fp8)...");
  const chatResult = await runCloudflareChat([
    { role: "system", content: "You are a concise AI." },
    { role: "user", content: "Summarize Portable Memory in 5 words." },
  ]);

  if (chatResult && chatResult.text) {
    console.log(`   Model used: ${chatResult.model}`);
    console.log(`   Response: "${chatResult.text.trim()}"`);
    console.log("   ✓ Cloudflare LLM inference succeeded!");
  } else {
    console.error("   ✗ Cloudflare LLM inference failed!");
    process.exit(1);
  }

  console.log("\n✨ All Cloudflare Workers AI checks passed!\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
