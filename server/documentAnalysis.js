// Extracts text from an uploaded milestone document and runs a basic
// content check on it: word count, placeholder/emptiness detection, and
// whether the expected sections/keywords for that milestone type show up.
// This is intentionally NOT full NLP/quality grading — it's a lightweight,
// explainable signal that feeds into the risk score alongside due dates.

const path = require("path");

const PLACEHOLDER_MARKERS = [
  "lorem ipsum",
  "to be added",
  "to be completed",
  "tbd",
  "placeholder text",
  "insert content here",
  "coming soon",
  "xxx",
];

// Phrases indicating the two things a genuine declaration/pledge should
// state. Checked separately (see checkPledge below) rather than lumped into
// one counter, so "0% pledge" only ever means neither is present — not that
// a document happened to score below some arbitrary threshold on an
// unrelated mix of words.
const ORIGINALITY_PHRASES = [
  "own work",
  "my own work",
  "hereby declare",
  "solemnly declare",
  "certify that this",
  "affirm that this",
  "not been submitted",
  "no part of this thesis",
  "no part of this report",
  "original work",
  "genuine and original",
  "solely my",
  "duly acknowledged",
];
const AI_DISCLOSURE_PHRASES = [
  "artificial intelligence",
  "generative ai",
  "ai tool",
  "ai tools",
  "chatgpt",
  "large language model",
  "ai assistance",
  "ai-assisted",
  "ai generated",
  "ai-generated",
  "no ai was used",
  "did not use ai",
  "without the use of ai",
];
// Where a real declaration page is expected to start. Used to narrow the
// search to the actual pledge section when one exists, instead of scanning
// the whole document — which would, for example, credit a computer-science
// thesis just for discussing "artificial intelligence" as its subject
// matter, with no declaration anywhere in sight.
const DECLARATION_HEADING_PATTERN =
  /\b(declaration(\s+of\s+originality)?|author'?s?\s+declaration|statement\s+of\s+originality|certificate\s+of\s+originality|academic\s+(integrity|honesty)\s+(declaration|statement)|plagiarism\s+(declaration|undertaking)|pledge)\b/i;

// Phrasing that shows up disproportionately often in AI-generated /
// AI-assisted writing (transition-word overuse, hedging, stock phrases).
// Presence of a few of these in a short document isn't proof of anything —
// this is a rough, explainable signal, not a plagiarism-style verdict.
const AI_STYLE_MARKERS = [
  "furthermore",
  "moreover",
  "in conclusion",
  "in summary",
  "it is important to note",
  "it's important to note",
  "additionally",
  "delve into",
  "delves into",
  "plays a crucial role",
  "plays a vital role",
  "in today's world",
  "in today's fast-paced",
  "as an ai language model",
  "it is worth noting",
  "on the other hand",
  "in essence",
  "a testament to",
  "underscores the importance",
  "navigate the complexities",
  "in the realm of",
  "in the digital age",
  "ever-evolving",
  "cutting-edge",
  "seamless integration",
  "comprehensive understanding",
];

// Expected keywords per known milestone name. Milestone names outside this
// list (custom ones a supervisor types in) just skip the section check and
// fall back to word count + placeholder detection.
const SECTION_EXPECTATIONS = {
  "Proposal Submission": ["problem statement", "objective", "scope", "methodology", "introduction"],
  "Literature Review": ["literature review", "related work", "reference", "previous research", "research gap"],
  "Requirement Analysis": ["functional requirement", "non-functional", "use case", "requirement"],
  "System Design": ["architecture", "design", "diagram", "database", "module"],
  "Implementation Phase 1": ["implementation", "module", "code", "algorithm", "development"],
  "Implementation Phase 2": ["implementation", "module", "integration", "feature", "development"],
  "Testing": ["test case", "testing", "result", "evaluation", "defect"],
  "Draft Thesis Submission": ["abstract", "introduction", "conclusion", "reference", "chapter"],
  "Final Defense": ["presentation", "summary", "conclusion", "future work"],
};

// Takes the uploaded file as a Buffer rather than a path on disk: on Vercel
// there is no writable uploads directory to read back from, so the file is
// analyzed in memory on its way to blob storage.
async function extractText(buffer, mimetype, originalName) {
  const ext = path.extname(originalName || "").toLowerCase();

  if (ext === ".txt" || mimetype === "text/plain") {
    return buffer.toString("utf-8");
  }

  if (ext === ".docx" || mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }

  if (ext === ".pdf" || mimetype === "application/pdf") {
    // pdf-parse (and the pdfjs-dist it wraps) loads its worker script through
    // a dynamic path that Vercel's serverless bundler can't trace, so the
    // worker file silently gets left out of the deployed function — it works
    // locally (full node_modules on disk) and then fails identically for
    // every single PDF once deployed. unpdf ships a serverless-built version
    // of pdf.js specifically to avoid that: no separate worker file, no
    // native dependency, same underlying text extraction.
    const { getDocumentProxy, extractText: extractPdfText } = require("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return text || "";
  }

  // Unsupported format (e.g. legacy .doc) — return null so the caller can
  // still record the submission without pretending we analyzed content.
  return null;
}

function analyzeText(text, milestoneName) {
  if (text === null) {
    return {
      supported: false,
      wordCount: 0,
      isPlaceholder: false,
      completenessScore: null,
      foundKeywords: [],
      missingKeywords: [],
      summary: "This file format couldn't be read for content analysis (submission was still recorded). Supported: .txt, .docx, .pdf.",
      effort: null,
      pledge: null,
      aiLikelihood: null,
      rawText: null,
    };
  }

  const cleaned = text.trim();
  const lower = cleaned.toLowerCase();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const hasPlaceholderMarker = PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
  const isPlaceholder = wordCount < 30 || hasPlaceholderMarker;

  const expectedKeywords = SECTION_EXPECTATIONS[milestoneName] || null;
  let foundKeywords = [];
  let missingKeywords = [];
  let keywordScore = null;

  if (expectedKeywords) {
    foundKeywords = expectedKeywords.filter((kw) => lower.includes(kw));
    missingKeywords = expectedKeywords.filter((kw) => !lower.includes(kw));
    keywordScore = Math.round((foundKeywords.length / expectedKeywords.length) * 100);
  }

  const lengthScore = Math.min(100, Math.round((wordCount / 400) * 100));
  const completenessScore = isPlaceholder
    ? Math.min(lengthScore, 15)
    : keywordScore !== null
    ? Math.round(0.5 * lengthScore + 0.5 * keywordScore)
    : lengthScore;

  let summary;
  if (isPlaceholder) {
    summary = hasPlaceholderMarker
      ? "Looks like placeholder text rather than real content — flagged for review."
      : `Very short (${wordCount} words) — may be incomplete.`;
  } else if (expectedKeywords && missingKeywords.length > 0) {
    summary = `${wordCount} words. Missing expected sections: ${missingKeywords.join(", ")}.`;
  } else if (expectedKeywords) {
    summary = `${wordCount} words, all expected sections present.`;
  } else {
    summary = `${wordCount} words.`;
  }

  const effort = computeEffort(cleaned, words);

  return {
    supported: true,
    wordCount,
    isPlaceholder,
    completenessScore,
    aiCompletenessScore: completenessScore,
    completenessOverridden: false,
    completenessOverrideNote: null,
    foundKeywords,
    missingKeywords,
    summary,
    effort,
    pledge: checkPledge(cleaned),
    aiLikelihood: computeAiLikelihood(cleaned, words, effort.sentenceVariety),
    rawText: cleaned, // stored so future submissions can be compared against this one for originality
  };
}

// ── Effort heuristic ────────────────────────────────────────────────────
// Not a judgment on writing quality — a rough, transparent signal from
// three cheap stylometric measures: how varied the vocabulary is, how
// varied the sentence lengths are (very uniform sentences often mean
// copy-pasted or templated text), and whether there's enough of it.
function computeEffort(text, words) {
  if (words.length < 10) {
    return { score: 0, label: "Too short to assess", vocabularyRichness: 0, sentenceVariety: 0 };
  }

  const uniqueWords = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z0-9]/gi, ""))).size;
  const vocabularyRichness = Math.min(100, Math.round((uniqueWords / words.length) * 180)); // type-token ratio, scaled

  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length > 2);
  let sentenceVariety = 50; // neutral default when too few sentences to measure
  if (sentences.length >= 3) {
    const lengths = sentences.map((s) => s.split(/\s+/).length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    sentenceVariety = Math.min(100, Math.round((stdDev / mean) * 150));
  }

  const lengthAdequacy = Math.min(100, Math.round((words.length / 300) * 100));
  const score = Math.round(0.4 * vocabularyRichness + 0.3 * sentenceVariety + 0.3 * lengthAdequacy);

  const label = score >= 65 ? "Looks like genuine, varied writing" : score >= 35 ? "Somewhat repetitive or thin" : "Very repetitive, uniform, or short";

  return { score, label, vocabularyRichness, sentenceVariety };
}

// ── Pledge / declaration check ──────────────────────────────────────────
// Looks for an actual declaration/pledge section (by heading) and checks,
// within that section, for the two things such a pledge should state: an
// originality claim and an AI-usage disclosure. If no declaration heading
// is found at all, the whole document is scanned as a fallback (some
// students state it inline without a labeled heading) but that's noted
// separately via sectionFound, so a supervisor can tell "no pledge found"
// apart from "found one, but it's missing something". This is still
// presence-of-keywords, not verification of exact wording or intent — a
// student could paste the phrases without meaning them — but restricting
// the search to the relevant section avoids the false credit an AI-related
// thesis would otherwise get just for discussing AI as its subject matter.
function checkPledge(text) {
  if (!text || !text.trim()) {
    return {
      included: false,
      matchPercent: 0,
      foundPhrases: [],
      missingPhrases: ["Statement of original work", "AI-usage disclosure"],
      sectionFound: false,
      excerpt: null,
    };
  }

  const headingMatch = text.match(DECLARATION_HEADING_PATTERN);

  // No declaration/pledge heading anywhere in the document: there is no
  // pledge to check. Scanning the whole document as a fallback was tried
  // and rejected — it meant any document that merely discusses "artificial
  // intelligence" as its subject matter (a CS thesis about AI, say) scored
  // as having an AI disclosure with no declaration in sight at all. A real
  // declaration/pledge page in academic writing is essentially always under
  // its own heading, so "no heading found" reliably means "not included".
  if (!headingMatch) {
    return {
      included: false,
      matchPercent: 0,
      foundPhrases: [],
      missingPhrases: ["Statement of original work", "AI-usage disclosure"],
      sectionFound: false,
      excerpt: null,
    };
  }

  const rest = text.slice(headingMatch.index);
  // Stop at the next section-like heading so a short document-wide match
  // doesn't pull in the whole rest of the thesis; cap at 1500 chars either way.
  const boundaryOffset = rest
    .slice(50)
    .search(/\n\s*(table of contents|acknowledge?ments?|abstract|chapter\s+\d|list of (figures|tables))\b/i);
  const windowLen = boundaryOffset > -1 ? Math.min(boundaryOffset + 50, 1500) : Math.min(rest.length, 1500);
  const searchText = rest.slice(0, windowLen);
  const excerpt = searchText.replace(/\s+/g, " ").trim().slice(0, 240);

  const lower = searchText.toLowerCase();
  const originalityStated = ORIGINALITY_PHRASES.some((p) => lower.includes(p));
  const aiDisclosureStated = AI_DISCLOSURE_PHRASES.some((p) => lower.includes(p));

  const foundPhrases = [];
  const missingPhrases = [];
  (originalityStated ? foundPhrases : missingPhrases).push("Statement of original work");
  (aiDisclosureStated ? foundPhrases : missingPhrases).push("AI-usage disclosure");

  const matchPercent = Math.round(((originalityStated ? 1 : 0) + (aiDisclosureStated ? 1 : 0)) * 50);

  return {
    included: originalityStated && aiDisclosureStated,
    matchPercent,
    foundPhrases,
    missingPhrases,
    sectionFound: true,
    excerpt,
  };
}

// ── AI-assistance likelihood heuristic ──────────────────────────────────
// Estimates how much of the text LOOKS AI-written/AI-assisted, from two
// cheap, explainable signals: density of stock AI-style phrasing, and how
// uniform the sentence lengths are (very human writing tends to be
// "bursty" — mixing short and long sentences; heavily AI-smoothed text
// tends to be more uniform). This is NOT a forensic AI detector — those
// don't reliably exist — it's a rough, transparent signal for the student
// and supervisor to look at alongside the document itself, same spirit as
// the effort score above.
function computeAiLikelihood(text, words, sentenceVarietyScore) {
  if (words.length < 30) {
    return { score: 0, label: "Too short to assess", indicatorsFound: [] };
  }

  const lower = text.toLowerCase();
  const indicatorsFound = AI_STYLE_MARKERS.filter((m) => lower.includes(m));
  const markerDensity = Math.min(100, Math.round((indicatorsFound.length / AI_STYLE_MARKERS.length) * 100 * 3));
  const uniformity = Math.max(0, 100 - sentenceVarietyScore); // low variety = more uniform = more AI-like

  const score = Math.min(100, Math.round(0.6 * markerDensity + 0.4 * uniformity));
  const label =
    score >= 65
      ? "Strong signs of AI-generated or AI-assisted text"
      : score >= 35
      ? "Some AI-style phrasing detected"
      : "Reads as mostly human-written";

  return { score, label, indicatorsFound };
}

// ── Originality / similarity check ─────────────────────────────────────
// Compares this submission's text against OTHER submissions already on
// file (other students' work for the same milestone, or this same
// student's other milestones) using word-shingle Jaccard similarity.
// This is NOT a plagiarism check against the internet or any outside
// source — only against documents already uploaded to this system.
function shingles(text, n = 5) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const set = new Set();
  for (let i = 0; i + n <= words.length; i++) set.add(words.slice(i, i + n).join(" "));
  return set;
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * @param {string} text - this submission's extracted text
 * @param {Array<{studentName, milestoneName, text}>} others - other stored submissions to compare against
 */
function checkOriginality(text, others) {
  const mySet = shingles(text);
  if (mySet.size === 0) return { originalityScore: 100, matches: [] };

  const matches = others
    .map((o) => ({
      studentName: o.studentName,
      milestoneName: o.milestoneName,
      similarity: Math.round(jaccardSimilarity(mySet, shingles(o.text)) * 100),
    }))
    .filter((m) => m.similarity >= 30)
    .sort((a, b) => b.similarity - a.similarity);

  const topSimilarity = matches.length ? matches[0].similarity : 0;
  const originalityScore = Math.max(0, 100 - topSimilarity);

  return { originalityScore, matches: matches.slice(0, 3) };
}

async function analyzeDocument(buffer, mimetype, originalName, milestoneName) {
  const text = await extractText(buffer, mimetype, originalName);
  return analyzeText(text, milestoneName);
}

module.exports = {
  analyzeDocument,
  analyzeText,
  checkOriginality,
  checkPledge,
  computeAiLikelihood,
  SECTION_EXPECTATIONS,
  ORIGINALITY_PHRASES,
  AI_DISCLOSURE_PHRASES,
  DECLARATION_HEADING_PATTERN,
};
