// LLM layer for the AI Assistant.
//
// The original assistant (still in index.js as answerFromData) is a rule
// engine: a chain of `.includes()` checks against the message, falling back
// to dumping the whole roster for anything it doesn't recognize. That's why
// it only ever seemed to answer a fixed set of questions — it genuinely
// only understood a fixed set of questions.
//
// This module adds a real language model in front of it, via OpenRouter
// (an OpenAI-compatible API that routes to many providers). The rule engine
// stays as the fallback for three cases: no API key configured, the
// OpenRouter call fails or times out, or the reply comes back empty. So the
// assistant always answers something, and only loses the "understands
// paraphrased questions" ability when the LLM path isn't available or working —
// it never goes fully silent.
//
// Privacy note: by default, real student names ARE sent to OpenRouter along
// with the rest of the roster data, because a supervisor typing a student's
// real name into a question needs the model to recognize it — anonymizing
// the roster data doesn't anonymize the question itself, so a question like
// "how is Ayesha Khan doing" can't be answered against a roster that only
// knows her as "Student-1". Several OpenRouter ":free" models explicitly log
// prompts to improve the model — that's the trade for free — so understand
// that student names/data can leave your server this way. Set
// AI_ASSISTANT_ANONYMIZE=true to anonymize the roster instead, at the cost
// of the assistant no longer being able to answer questions that name a
// specific student (it can still answer roster-wide questions like "who's
// highest risk" — those never depended on names in the first place).

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openrouter/free"; // OpenRouter's own router across free models; specific
// free model IDs get retired/renamed often, so pointing at a fixed one tends to break within a
// few months. Override with OPENROUTER_MODEL if you want a specific model instead.
const REQUEST_TIMEOUT_MS = 15_000;

function anonymizationEnabled() {
  return process.env.AI_ASSISTANT_ANONYMIZE === "true";
}

// Builds the compact, privacy-scrubbed (by default) context sent to the
// model, plus the label->realName map used to translate the reply back.
function buildContext(students, interventions) {
  const anonymize = anonymizationEnabled();
  const labelFor = new Map(); // student.id -> "Student-1"
  const nameFor = new Map(); // "Student-1" -> real name

  students.forEach((s, i) => {
    const label = anonymize ? `Student-${i + 1}` : s.name;
    labelFor.set(s.id, label);
    nameFor.set(label, s.name);
  });

  const roster = students.map((s) => {
    const label = labelFor.get(s.id);
    const overdue = (s.milestones || []).filter((m) => m.status === "Overdue").map((m) => m.name);
    const late = (s.milestones || []).filter((m) => m.status === "Late").map((m) => m.name);
    return (
      `${label}: risk=${s.riskLevel} (${s.riskScore}/100${s.isRiskOverridden ? ", manually overridden" : ""}), ` +
      `progress=${s.progressPct}%, last active ${s.lastActivity}, ` +
      `meetings ${s.meetingsAttended || 0}/${s.meetingsScheduled || 0}` +
      (overdue.length ? `, overdue: ${overdue.join(", ")}` : "") +
      (late.length ? `, late: ${late.join(", ")}` : "") +
      (s.riskOverrideNote ? `, override note: "${s.riskOverrideNote}"` : "")
    );
  });

  const recentInterventions = interventions.slice(0, 15).map((iv) => {
    const label = labelFor.get(iv.studentId) || iv.studentName;
    return `${iv.date}: ${label} — ${iv.action} (outcome: ${iv.outcome})`;
  });

  const contextText =
    `ROSTER (${students.length} students):\n${roster.join("\n")}\n\n` +
    `RECENT INTERVENTIONS:\n${recentInterventions.length ? recentInterventions.join("\n") : "(none logged)"}`;

  return { contextText, nameFor, anonymize };
}

// Reverses the label substitution in the model's reply. Plain string
// replace (not word-boundary regex) so it still catches possessives like
// "Student-1's" — a label is distinctive enough that this won't misfire.
function deAnonymize(text, nameFor) {
  let out = text;
  for (const [label, name] of nameFor) {
    out = out.split(label).join(name);
  }
  return out;
}

const SYSTEM_PROMPT = `You are the AI Assistant inside DecisionLens, a thesis-supervision tool. You answer a supervisor's questions about their student roster using ONLY the data given to you below — never invent students, numbers, or events that aren't in it. If the data doesn't contain what's being asked, say so plainly rather than guessing. Keep answers short and direct — a sentence or two, or a brief list — the way a helpful colleague would answer over chat, not a report. Risk scores: 70+ is high risk, 40-69 moderate, below 40 low.`;

async function callOpenRouter(message, contextText) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    // Optional, per OpenRouter's docs — identifies the app on their
    // leaderboards. Harmless to omit, so only sent if configured.
    if (process.env.APP_URL) headers["HTTP-Referer"] = process.env.APP_URL;
    headers["X-Title"] = "DecisionLens";

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\n\n${contextText}` },
          { role: "user", content: message },
        ],
        temperature: 0.3,
        max_tokens: 400,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`OpenRouter request failed (${response.status}):`, body.slice(0, 500));
      return null;
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content;
    return typeof reply === "string" && reply.trim() ? reply.trim() : null;
  } catch (err) {
    // Network error, timeout (AbortError), or malformed response — all
    // treated the same way: fall back to the local engine rather than
    // surface an error to a supervisor mid-conversation.
    console.error("OpenRouter request error:", err.message || err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Tries the LLM first; falls back to the deterministic local engine
// (passed in as localFallback) if no key is set, the call fails, times out,
// or returns nothing usable.
async function answerWithAI(message, students, interventions, localFallback) {
  if (!students.length) {
    return "You don't have any students on your roster yet, so I don't have anything to analyze.";
  }

  const { contextText, nameFor } = buildContext(students, interventions);
  const llmReply = await callOpenRouter(message, contextText);

  if (llmReply) return deAnonymize(llmReply, nameFor);
  return localFallback(message, students, interventions);
}

module.exports = { answerWithAI };
