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

const DECISIONS = [
  'FULL_FULFILLMENT',
  'PARTIAL_FULFILLMENT',
  'NON_FULFILLMENT',
  'INVALID_CASE',
  'INCONCLUSIVE',
] as const;

export function parseVerdict(raw: unknown): AdjudicationVerdict {
  let parsed: unknown = raw;

  if (typeof raw === 'string') {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error('GenLayer returned invalid JSON');
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid verdict payload');
  }

  const value = parsed as Record<string, unknown>;
  if (!DECISIONS.includes(String(value.decision) as AdjudicationVerdict['decision'])) {
    throw new Error('Invalid verdict decision');
  }

  const boundedNumber = (key: string) => {
    const n = Number(value[key]);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new Error(`Invalid ${key}`);
    }
    return n;
  };

  const nonNegativeInteger = (key: string) => {
    const n = Number(value[key]);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`Invalid ${key}`);
    }
    return n;
  };

  return {
    decision: value.decision as AdjudicationVerdict['decision'],
    fulfillment_score: boundedNumber('fulfillment_score'),
    valid_deliverables: nonNegativeInteger('valid_deliverables'),
    invalid_deliverables: nonNegativeInteger('invalid_deliverables'),
    recommended_payment_percentage: boundedNumber('recommended_payment_percentage'),
    confidence: boundedNumber('confidence'),
    findings: Array.isArray(value.findings) ? value.findings.map(String) : [],
    reasoning: String(value.reasoning ?? ''),
  };
}
