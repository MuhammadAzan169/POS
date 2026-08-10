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

You are given a BUSINESS DATA block containing figures already calculated from the live database.

ACCURACY
- Copy numbers EXACTLY as they appear, digit for digit. Do not round, re-derive or "tidy" them. If the data says 58, write 58 — never 56.
- Never compute new figures yourself; every total you need is already provided. If something is not present, say so rather than calculating it.
- Amounts use the currency in the block, written like "Rs 12,500".

PERIODS — every figure names the period it covers
- salesByPeriod.today is TODAY only; last7Days, previous7Days and last30Days are those ranges.
- productPerformance covers the LAST 30 DAYS, not today. Say "in the last 30 days" when quoting it.
- Never call a number "today" unless it came from salesByPeriod.today.
- "Lowest/worst selling" means productPerformance.slowestSellersByUnits, or deadStockNotSoldInLast30Days for items that sold nothing. It is NEVER the last entry of bestSellersByUnits — that list holds top performers only.

DEPTH AND EVIDENCE — the owner wants to see your working
- Give a thorough answer, not a one-liner. Explain what the numbers mean and why it matters to the business.
- Back every claim with the specific figures it rests on, and name where they came from, e.g. "(perShopLast30Days: Main Branch)".
- Where a claim is a judgement rather than a fact, say so and explain the reasoning.
- Finish with clear, specific next steps — quantities, amounts and which shop, not vague advice.

FORMAT — use real markdown, chosen to suit the content
- Open with a one-sentence answer in bold.
- Use a "## Evidence" style heading, short paragraphs for explanation, and bullets for lists of findings.
- Use a MARKDOWN TABLE whenever comparing things across a common set of columns — shops, products, periods, suppliers. Tables render properly, so prefer them over long bullet lists of numbers. Example:
  | Shop | Revenue | Profit | Net |
  | --- | --- | --- | --- |
  | Main Branch | Rs 178,330 | Rs 84,010 | Rs 71,710 |
- Use a numbered list for recommended actions, in priority order.
- Keep sentences short. No preamble, no restating the question.`;

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

/**
 * The site URL sent to OpenRouter for attribution.
 *
 * Hardcoding localhost in .env would report every production request as coming
 * from a dev machine, so hosts that expose their own URL are preferred. Vercel
 * sets VERCEL_PROJECT_PRODUCTION_URL (stable domain) and VERCEL_URL (this
 * specific deployment), neither with a protocol.
 */
function appUrl(): string {
  const explicit = process.env.OPENROUTER_APP_URL?.trim();
  const isLocal = !explicit || /localhost|127\.0\.0\.1/.test(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

  // An explicit non-local value always wins; otherwise fall back to the host.
  if (explicit && !isLocal) return explicit;
  if (vercel) return `https://${vercel}`;
  return explicit || "http://localhost:8080";
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
        // Attribution only — OpenRouter uses these for its public rankings.
        // Neither affects whether a request succeeds.
        "HTTP-Referer": appUrl(),
        "X-Title": process.env.OPENROUTER_APP_NAME ?? "A-POS",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 2500,
        // Reasoning models (nemotron and friends) spend part of the token budget
        // thinking, which truncated answers mid-table. Keep that minimal and out
        // of the reply; providers without reasoning ignore this field.
        reasoning: { effort: "low", exclude: true },
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
    const choice = data?.choices?.[0];
    const answer = choice?.message?.content?.trim();
    if (!answer) throw new Error("empty response from model");

    // A reply cut off at the token limit can end mid-table and read as if the
    // data stopped there. Say so rather than showing a half-finished answer.
    if (choice?.finish_reason === "length") {
      return `${answer}

---

*This answer was cut short by the model's output limit. Ask a narrower question for the rest.*`;
    }
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
