/**
 * Vision LLM extraction for scanned questionnaire pages.
 * Conservative policy: never guess — unclear marks → null + needs_clarification for the user.
 * Requires OPENAI_API_KEY. Model: OPENAI_RESEARCH_MODEL (default gpt-4o-mini).
 */

import { VAR_ORDER, normalizeVarValue } from './researchQuestionnaireSchema.js';

function buildSystemPrompt() {
  return `You help digitise a printed academic questionnaire (coal road freight, South Africa). Respondents mark ONE answer per question (usually an X in a box).

CRITICAL RULES — accuracy over completeness:
1. NEVER guess. If you are not sure which box is marked, output null for that variable in "values" and list it in "needs_clarification" with a short reason.
2. Only output an integer when ONE choice is clearly and unambiguously marked (X or circle) for that row.
3. If the mark is faint, smudged, cropped, glare, or could be two columns, use null and add needs_clarification.
4. If a page or row is not visible in any image, use null (do not infer from other answers).
5. Do not "fill in" missing sections from assumptions.

Output format: ONE JSON object (no markdown) with exactly two top-level keys:
- "values": object with ALL keys ${VAR_ORDER.join(', ')} — each value is either an integer in the allowed range for that variable, or null.
- "needs_clarification": array of objects { "code": "Vn", "reason": "brief text" } listing EVERY variable where you could not read a single clear mark, or where you are uncertain. If you output null for a variable because the paper might still be answered but the image is unclear, it MUST appear here. If you are confident about the mark, do NOT list it here.

Allowed ranges for "values":
- V1: 1–4 (age). V2: 1–4 (gender). V3: 1–4 (position). V4: 1–16 (licence). V5: 1–6 (tenure).
- V6–V47: 1–5 Likert — printed columns: Strongly agree=5, Agree=4, Neither=3, Disagree=2, Strongly disagree=1.

The "values" object MUST contain every key V1 through V47 even if all are null.`;
}

/**
 * Normalise model output: support wrapped { values, needs_clarification } or legacy flat V1…V47.
 */
function splitModelPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { valuesBlock: {}, needsList: [] };
  }
  let valuesBlock = {};
  let needsList = [];
  if (typeof parsed.values === 'object' && parsed.values !== null) {
    valuesBlock = { ...parsed.values };
    needsList = Array.isArray(parsed.needs_clarification) ? parsed.needs_clarification : [];
  } else {
    for (const code of VAR_ORDER) {
      if (Object.prototype.hasOwnProperty.call(parsed, code)) {
        valuesBlock[code] = parsed[code];
      }
    }
  }
  return { valuesBlock, needsList };
}

function buildNeedsClarification(needsList) {
  const out = [];
  const seen = new Set();
  for (const item of needsList || []) {
    const code = String(item?.code || '')
      .trim()
      .toUpperCase();
    if (!VAR_ORDER.includes(code) || seen.has(code)) continue;
    seen.add(code);
    const reason = String(item?.reason || 'Could not read clearly from the scan — please choose the correct answer from the paper.')
      .trim()
      .slice(0, 500);
    out.push({ code, reason });
  }
  return out;
}

const GAP_CLARIFY_REASON =
  'No confident read for this field (missing, blank in image, or not listed as clear). Please select the answer from the paper, or confirm it was left blank on the questionnaire.';

/**
 * Merge model-listed clarifications with any V1–V47 that are still null/invalid after normalisation.
 */
function finalizeNeedsFromBlocks(valuesBlock, needsList) {
  let needs = buildNeedsClarification(needsList);
  const clarifyCodes = new Set(needs.map((n) => n.code));
  for (const code of VAR_ORDER) {
    const n = normalizeVarValue(code, valuesBlock[code]);
    if (n == null && !clarifyCodes.has(code)) {
      needs.push({ code, reason: GAP_CLARIFY_REASON });
      clarifyCodes.add(code);
    }
  }
  return buildNeedsClarification(needs);
}

/**
 * Stored `last_scan_response` before envelopes was often raw model JSON: flat V1…V47, or `{ values, needs_clarification }`,
 * or the extraction debug object with `applied_after_validation`. Recompute clarification rows the same way as a fresh scan.
 *
 * @param {unknown} parsed
 * @returns {{ code: string, reason: string }[]}
 */
export function needsClarificationFromStoredPayload(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

  const isEnvelope =
    Array.isArray(parsed.needs_clarification) &&
    (Object.prototype.hasOwnProperty.call(parsed, 'applied_values') ||
      Object.prototype.hasOwnProperty.call(parsed, 'scanned_at'));

  let valuesBlock = {};
  let needsList = [];

  if (isEnvelope) {
    needsList = parsed.needs_clarification;
    const applied = parsed.applied_values;
    if (applied && typeof applied === 'object' && !Array.isArray(applied)) {
      valuesBlock = { ...applied };
    }
  } else {
    const split = splitModelPayload(parsed);
    valuesBlock = split.valuesBlock;
    needsList = split.needsList;
  }

  const hasQuestionnaireShape =
    isEnvelope ||
    VAR_ORDER.some(
      (code) =>
        Object.prototype.hasOwnProperty.call(valuesBlock, code) ||
        Object.prototype.hasOwnProperty.call(parsed, code)
    );

  if (!hasQuestionnaireShape) {
    if (Array.isArray(parsed.needs_clarification) && parsed.needs_clarification.length) {
      return buildNeedsClarification(parsed.needs_clarification);
    }
    return [];
  }

  return finalizeNeedsFromBlocks(valuesBlock, needsList);
}

/**
 * Build validated values; any code listed for clarification is NEVER saved (user must enter).
 */
function buildConservativeValues(valuesBlock, needsClarification) {
  const clarifyCodes = new Set(needsClarification.map((n) => n.code));
  const values = {};
  for (const code of VAR_ORDER) {
    if (clarifyCodes.has(code)) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(valuesBlock, code)) {
      continue;
    }
    const n = normalizeVarValue(code, valuesBlock[code]);
    if (n != null) {
      values[code] = n;
    }
  }
  return values;
}

/**
 * @param {{ mime: string, base64: string }[]} images
 * @returns {Promise<{ raw: object, values: object, needsClarification: { code: string, reason: string }[], parseError?: string }>}
 */
export async function extractQuestionnaireFromImages(images) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) {
    return {
      raw: {},
      values: {},
      needsClarification: [],
      parseError:
        'OPENAI_API_KEY is not set. Add it to the project root .env (same folder as server.js), restart the Node server, then use “Run reader on queued pages”. The in-app camera does not need this key — only the AI reader does.',
    };
  }
  if (!Array.isArray(images) || images.length === 0) {
    return { raw: {}, values: {}, needsClarification: [], parseError: 'No images provided.' };
  }

  const model = (process.env.OPENAI_RESEARCH_MODEL || 'gpt-4o-mini').trim();
  const userContent = [
    {
      type: 'text',
      text: 'Read these questionnaire page images. Return one JSON object with keys "values" (all V1–V47) and "needs_clarification" (array), as specified in the system message.',
    },
    ...images.map((im) => ({
      type: 'image_url',
      image_url: { url: `data:${im.mime || 'image/jpeg'};base64,${im.base64}`, detail: 'high' },
    })),
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userContent },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText || 'OpenAI request failed';
    return { raw: data, values: {}, needsClarification: [], parseError: msg };
  }

  const text = data?.choices?.[0]?.message?.content || '';
  let parsed = null;
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return {
      raw: { text },
      values: {},
      needsClarification: [],
      parseError: `Model did not return valid JSON: ${e.message}. Enter values manually or try clearer photos.`,
    };
  }

  const { valuesBlock, needsList } = splitModelPayload(parsed);
  const needsClarification = finalizeNeedsFromBlocks(valuesBlock, needsList);
  const values = buildConservativeValues(valuesBlock, needsClarification);

  const raw = {
    values: valuesBlock,
    needs_clarification: needsClarification,
    applied_after_validation: values,
  };

  return { raw, values, needsClarification, parseError: undefined };
}
