import { readFile } from "node:fs/promises";
import path from "node:path";

async function loadEnvFile(envPath) {
  try {
    const contents = await readFile(envPath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

/** Lädt `.env` / `.env.local` im Projektroot und optional unter `web/` (Next.js). */
export async function loadDotEnv(rootDir) {
  await loadEnvFile(path.join(rootDir, ".env"));
  await loadEnvFile(path.join(rootDir, ".env.local"));
}

/**
 * Wie loadDotEnv, plus `web/.env` und `web/.env.local` — nutzt ggf. NEXT_PUBLIC_SUPABASE_URL als SUPABASE_URL.
 */
export async function loadScoutbaseEnv(rootDir) {
  await loadDotEnv(rootDir);
  await loadEnvFile(path.join(rootDir, "web", ".env"));
  await loadEnvFile(path.join(rootDir, "web", ".env.local"));

  if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getOptionalIntEnv(name, defaultValue) {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }
  return parsed;
}
