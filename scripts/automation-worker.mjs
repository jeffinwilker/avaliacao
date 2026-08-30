import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN_ENV = resolve(ROOT, "apps", "admin", ".env.local");
const ENDPOINT =
  process.env.AUTOMATION_CRON_URL ||
  "http://127.0.0.1:3002/api/cron/send-requests";
const INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.AUTOMATION_CRON_INTERVAL_MS) || 5 * 60_000
);
const START_DELAY_MS = 15_000;

const cronSecret = process.env.CRON_SECRET || readEnvValue("CRON_SECRET");
if (!cronSecret) {
  throw new Error(`CRON_SECRET não encontrado em ${ADMIN_ENV}`);
}

let running = false;

async function runAutomations() {
  if (running) return;
  running = true;
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": cronSecret },
      signal: AbortSignal.timeout(4 * 60_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `Endpoint respondeu HTTP ${response.status}: ${result.error || "erro desconhecido"}`
      );
    }

    const now = new Date().toISOString();
    console.log(
      `[${now}] carrinhos=${result.sync?.found ?? 0} ` +
        `automações_enviadas=${result.automations?.sent ?? 0} ` +
        `avaliações_enviadas=${result.reviews?.sent ?? 0}`
    );
    if (result.sync?.errors?.length) {
      console.error(`[${now}] erros_na_sincronização=${result.sync.errors.join(" | ")}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${new Date().toISOString()}] ${message}`);
  } finally {
    running = false;
  }
}

function readEnvValue(key) {
  const content = readFileSync(ADMIN_ENV, "utf8");
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));
  if (!line) return "";
  const raw = line.slice(line.indexOf("=") + 1).trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

const startTimer = setTimeout(runAutomations, START_DELAY_MS);
const interval = setInterval(runAutomations, INTERVAL_MS);

function shutdown() {
  clearTimeout(startTimer);
  clearInterval(interval);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(
  `Worker de automações ativo: primeira execução em ${START_DELAY_MS / 1_000}s, ` +
    `intervalo de ${INTERVAL_MS / 60_000}min.`
);
