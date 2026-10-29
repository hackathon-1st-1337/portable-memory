/**
 * Sanitization and validation utilities for Portable Memory
 */

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const NAMESPACE_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const KEY_REGEX = /^[a-z0-9][a-z0-9._-]{0,79}$/;

export const MAX_VALUE_TEXT_BYTES = 4096;

/** Normalize and validate a pod slug */
export function sanitizeSlug(input: string): string {
  const slug = input.trim().toLowerCase();
  if (!SLUG_REGEX.test(slug)) {
    throw new Error(
      "Pod slug must be 1-40 characters of lowercase letters, numbers, and hyphens (e.g. 'work' or 'personal-2')"
    );
  }
  return slug;
}

/** Normalize and validate a namespace name */
export function sanitizeNamespaceName(input: string): string {
  const name = input.trim().toLowerCase();
  if (!NAMESPACE_NAME_REGEX.test(name)) {
    throw new Error(
      "Folder name must be 1-40 characters of lowercase letters, numbers, and hyphens (e.g. 'projects' or 'dev-tools')"
    );
  }
  return name;
}

/** Normalize and validate an entry key */
export function sanitizeKey(input: string): string {
  const key = input.trim().toLowerCase();
  if (!KEY_REGEX.test(key)) {
    throw new Error(
      "Key must be 1-80 characters of lowercase letters, numbers, dots, hyphens, or underscores (e.g. 'tone' or 'editor.theme')"
    );
  }
  return key;
}

/**
 * Validates entry value (must be string, object, or array) and
 * produces a sanitized, flattened text representation for rendering and search.
 */
export function sanitizeValue(raw: unknown): {
  value: unknown;
  valueText: string;
} {
  if (raw === null || raw === undefined) {
    throw new Error("Memory value cannot be empty");
  }

  let value: unknown = raw;
  let text = "";

  if (typeof raw === "string") {
    value = raw.trim();
    text = (value as string).replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, "");
  } else if (typeof raw === "number" || typeof raw === "boolean") {
    value = raw;
    text = String(raw);
  } else if (typeof raw === "object") {
    try {
      // Ensure it can be serialized cleanly
      const serialized = JSON.stringify(raw);
      value = JSON.parse(serialized);
      text = flattenValueToText(value);
    } catch {
      throw new Error("Invalid JSON memory value");
    }
  } else {
    throw new Error("Memory value must be a string, object, or array");
  }

  const byteLength = Buffer.byteLength(text, "utf-8");
  if (byteLength > MAX_VALUE_TEXT_BYTES) {
    throw new Error(
      `Memory value is too large (${byteLength} bytes). Maximum allowed size is ${MAX_VALUE_TEXT_BYTES} bytes.`
    );
  }

  return { value, valueText: text };
}

/** Flatten complex JSON values into searchable/readable text */
function flattenValueToText(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) {
    return val.map((item) => flattenValueToText(item)).filter(Boolean).join(", ");
  }
  if (typeof val === "object") {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${flattenValueToText(v)}`)
      .filter(Boolean)
      .join("\n");
  }
  return "";
}
