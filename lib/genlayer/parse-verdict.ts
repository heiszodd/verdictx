export type AdjudicationVerdict = {
  decision: 'FULL_FULFILLMENT' | 'PARTIAL_FULFILLMENT' | 'NON_FULFILLMENT' | 'INVALID_CASE' | 'INCONCLUSIVE';
  fulfillment_score: number;
  valid_deliverables: number;
  invalid_deliverables: number;
  recommended_payment_percentage: number;
  confidence: number;
  findings: string[];
  reasoning: string;
};

export function parseVerdict(raw: unknown): AdjudicationVerdict {
  if (typeof raw !== 'string') throw new Error('GenLayer returned a non-string verdict');
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('GenLayer returned invalid JSON');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid verdict payload');
  const value = parsed as Record<string, unknown>;
  const decision = value.decision;
  if (!['FULL_FULFILLMENT', 'PARTIAL_FULFILLMENT', 'NON_FULFILLMENT', 'INVALID_CASE', 'INCONCLUSIVE'].includes(String(decision))) {
    throw new Error('Invalid verdict decision');
  }
  const number = (key: string) => {
    const n = Number(value[key]);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`Invalid ${key}`);
    return n;
  };
  return {
    decision: decision as AdjudicationVerdict['decision'],
    fulfillment_score: number('fulfillment_score'),
    valid_deliverables: Number(value.valid_deliverables ?? 0),
    invalid_deliverables: Number(value.invalid_deliverables ?? 0),
    recommended_payment_percentage: number('recommended_payment_percentage'),
    confidence: number('confidence'),
    findings: Array.isArray(value.findings) ? value.findings.map(String) : [],
    reasoning: String(value.reasoning ?? ''),
  };
}
