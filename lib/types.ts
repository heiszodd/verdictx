export type AgreementStatus = 'DRAFT' | 'ACTIVE' | 'DELIVERED' | 'DISPUTED' | 'RESOLVED' | 'CANCELLED';
export type CaseStatus = 'OPEN' | 'EVIDENCE_COLLECTION' | 'INVESTIGATING' | 'ADJUDICATING' | 'CONSENSUS' | 'VERDICT_READY' | 'SETTLING' | 'RESOLVED';
export type EvidenceType = 'WEB' | 'DOCUMENT' | 'SUBMISSION' | 'TRANSACTION' | 'OTHER';

export interface Agent {
  id: string;
  name: string;
  role: string;
  address: string;
  reputation: number;
  agreements: number;
  disputes: number;
  wins: number;
  losses: number;
  volume: number;
}

export interface Evidence {
  id: string;
  type: EvidenceType;
  title: string;
  uri?: string;
  submittedBy: string;
  description: string;
  status: 'VERIFIED' | 'PENDING' | 'REJECTED';
}

export interface Verdict {
  decision: string;
  fulfillmentScore: number;
  validDeliverables: number;
  invalidDeliverables: number;
  paymentPercentage: number;
  confidence: number;
  findings: string[];
  reasoning: string;
}

export interface CaseRecord {
  id: string;
  agreementId: string;
  title: string;
  plaintiff: string;
  defendant: string;
  escrow: number;
  currency: string;
  status: CaseStatus;
  openedAt: string;
  claim: string;
  counterclaim: string;
  evidence: Evidence[];
  verdict?: Verdict;
}
