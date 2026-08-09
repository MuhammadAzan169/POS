import { createServerFn } from "@tanstack/react-start";

/**
 * OpenRouter access.
 *
 * Everything inside `.handler()` runs on the server only — TanStack Start strips
 * it from the browser bundle and replaces the call with an RPC. That is why
 * OPENROUTER_API_KEY has no VITE_ prefix: a VITE_ variable would be compiled
 * into the JavaScript every visitor downloads, and anyone could spend the credit.
 */

export interface AskInput {
  /** Conversation so far, oldest first. */
  messages: { role: "user" | "assistant"; content: string }[];
  /** Pre-computed business figures the model must reason from. */
  brief: string;
}

export interface AskResult {
  ok: boolean;
  answer: string;
  /** Which model actually produced the answer. */
  model?: string;
  /** Models that were tried and failed, with the reason. */
  attempts: { model: string; error: string }[];
}

/**
 * Models are tried in order and the first that answers wins.
 * Free models are frequently rate-limited or retired, so the fallback chain is
 * what keeps the tab working rather than dying on a 429.
 */
function modelChain(): string[] {
  const env = process.env;
  const listed = [
    env.OPENROUTER_MODEL,
    env.OPENROUTER_MODEL1,
    env.OPENROUTER_MODEL2,
    env.OPENROUTER_MODEL3,
    env.OPENROUTER_MODEL4,
  ].filter((m): m is string => Boolean(m && m.trim()));
  // De-duplicate while preserving the configured order.
  return [...new Set(listed.map((m) => m.trim()))];
}

const SYSTEM_PROMPT = `You are the business assistant inside A-POS, a retail point-of-sale system for a multi-shop cosmetics and clothing business in Pakistan.

You will be given a BUSINESS DATA block containing figures already calculated from the live database. Rules:
- Base every number you state on that block. Never invent or estimate figures that are not there.
- If the block does not contain what is needed to answer, say so plainly and name what is missing.
- Amounts are in the currency given in the block. Write them like "Rs 12,500".
- Be concise and practical: a shop owner is reading this between customers.
- Lead with the answer, then the supporting numbers, then a concrete suggested action.
- Use short markdown: a one-line summary, then bullets. No preamble, no restating the question.
- When asked something open-ended ("how is business?"), pick the 3-4 things that most need attention.`;

/**
 * The figures go in the LAST USER message, not a second system message.
 *
 * Tested against the configured models: gpt-oss-20b silently ignores anything
 * after the first system message and replies "I don't have any inventory data",
 * while every model reads it reliably when it arrives as part of the question.
 * Attaching it to the newest turn also keeps earlier turns small and guarantees
 * the model reasons over current numbers rather than a stale copy.
 */
function buildMessages(input: AskInput) {
  const history = input.messages.slice(0, -1);
  const latest = input.messages[input.messages.length - 1];

  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...history,
    {
      role: "user" as const,
      content:
        `BUSINESS DATA (live, generated just now):\n${input.brief}\n\n` +
        `QUESTION: ${latest?.content ?? "Give me an overview of the business."}`,
    },
  ];
}

async function callOpenRouter(model: string, apiKey: string, input: AskInput): Promise<string> {
  const controller = new AbortController();
  // Free models can hang; fail over rather than leaving the user waiting.
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter uses these for its rankings; both are optional.
        "HTTP-Referer": process.env.OPENROUTER_APP_URL ?? "http://localhost:8080",
        "X-Title": process.env.OPENROUTER_APP_NAME ?? "A-POS",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 900,
        messages: buildMessages(input),
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      // OpenRouter returns JSON errors; surface the message when there is one.
      let detail = text.slice(0, 200);
      try {
        const parsed = JSON.parse(text);
        detail = parsed?.error?.message ?? detail;
      } catch { /* not JSON — keep the raw snippet */ }
      throw new Error(`HTTP ${res.status}: ${detail}`);
    }

    const data = JSON.parse(text);
    // Some providers report an error inside a 200 response.
    if (data?.error) throw new Error(data.error.message ?? "provider returned an error");
    const answer = data?.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("empty response from model");
    return answer;
  } finally {
    clearTimeout(timeout);
  }
}

export const askAssistant = createServerFn({ method: "POST" })
  .validator((data: AskInput) => data)
  .handler(async ({ data }): Promise<AskResult> => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const models = modelChain();
    const attempts: AskResult["attempts"] = [];

    if (!apiKey) {
      return {
        ok: false,
        answer: "No OpenRouter API key configured. Add OPENROUTER_API_KEY to .env and restart the dev server.",
        attempts,
      };
    }
    if (models.length === 0) {
      return {
        ok: false,
        answer: "No model configured. Add OPENROUTER_MODEL1 (and optionally MODEL2/MODEL3) to .env.",
        attempts,
      };
    }

    for (const model of models) {
      try {
        const answer = await callOpenRouter(model, apiKey, data);
        return { ok: true, answer, model, attempts };
      } catch (e) {
        const error = e instanceof Error ? (e.name === "AbortError" ? "timed out after 45s" : e.message) : String(e);
        attempts.push({ model, error });
        // Keep going — the next model in the chain may be available.
      }
    }

    return {
      ok: false,
      answer:
        `All ${models.length} configured model${models.length === 1 ? "" : "s"} failed. ` +
        `Free models are often rate-limited or retired — check openrouter.ai/models and update .env.`,
      attempts,
    };
  });

/** Lets the UI show which models are configured without exposing the key. */
export const aiStatus = createServerFn({ method: "GET" }).handler(async () => ({
  configured: Boolean(process.env.OPENROUTER_API_KEY),
  models: modelChain(),
}));
