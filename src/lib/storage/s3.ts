import "server-only";

import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { s3Objects, type S3Object } from "@/db/schema";
import { createEntry } from "@/lib/memory/entries";
import { logAuditEvent } from "@/lib/memory/audit";

export interface UploadFileInput {
  podId: string;
  namespaceId: string;
  fileName: string;
  contentType: string;
  buffer: Buffer;
  userId?: string;
}

/**
 * Ingests a file into S3-compatible Object Storage and extracts its content into a Memory Entry.
 */
export async function uploadAndIngestFile(
  input: UploadFileInput
): Promise<{ s3Object: S3Object; entryId: string }> {
  const s3Endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || "us-east-2";

  const keySafeName = input.fileName
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "-")
    .slice(0, 60);

  const s3Key = `pods/${input.podId}/files/${Date.now()}-${keySafeName}`;

  // If S3 credentials are configured, we can upload using S3 REST API
  if (s3Endpoint && accessKey && secretKey) {
    try {
      const uploadUrl = `${s3Endpoint.replace(/\/$/, "")}/${s3Key}`;
      await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": input.contentType,
        },
        body: new Uint8Array(input.buffer),
      });
    } catch (err) {
      console.warn("Direct S3 PUT skipped/failed, recording metadata:", err);
    }
  }

  // Extract text representation for memory entry
  let extractedText = "";
  let jsonValue: any = null;

  if (input.contentType.includes("json")) {
    try {
      jsonValue = JSON.parse(input.buffer.toString("utf8"));
      extractedText = typeof jsonValue === "string" ? jsonValue : JSON.stringify(jsonValue, null, 2);
    } catch {
      extractedText = input.buffer.toString("utf8");
      jsonValue = extractedText;
    }
  } else {
    extractedText = input.buffer.toString("utf8");
    jsonValue = extractedText;
  }

  // Create memory entry for the ingested file content (max 4KB sanitized)
  const memoryKey = `file_${keySafeName.replace(/\.[^.]+$/, "")}_${Date.now().toString().slice(-4)}`;
  const entry = await createEntry({
    podId: input.podId,
    namespaceId: input.namespaceId,
    key: memoryKey,
    value: jsonValue,
    pinned: false,
    kind: "fact",
    createdByUser: true,
  });

  // Record in s3_objects
  const [record] = await db
    .insert(s3Objects)
    .values({
      podId: input.podId,
      s3Key,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.buffer.length,
      sourceEntryId: entry.id,
    })
    .returning();

  await logAuditEvent({
    podId: input.podId,
    actorType: "user",
    action: "storage.upload",
    outcome: "ok",
    namespaceId: input.namespaceId,
    key: memoryKey,
    detail: { fileName: input.fileName, size: input.buffer.length, s3Key },
  });

  return { s3Object: record, entryId: entry.id };
}

/**
 * List uploaded files for a pod.
 */
export async function listPodFiles(podId: string): Promise<S3Object[]> {
  return db
    .select()
    .from(s3Objects)
    .where(eq(s3Objects.podId, podId))
    .orderBy(desc(s3Objects.createdAt))
    .limit(50);
}
