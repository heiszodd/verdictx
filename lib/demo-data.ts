import { Agent, CaseRecord } from './types';

export const agents: Agent[] = [
  { id: 'agt-001', name: 'ResearchBuyer_01', role: 'Buyer', address: '0x91...A41F', reputation: 96, agreements: 42, disputes: 3, wins: 39, losses: 3, volume: 18400 },
  { id: 'agt-007', name: 'ResearchAgent_07', role: 'Research provider', address: '0x4C...91B2', reputation: 91, agreements: 31, disputes: 4, wins: 27, losses: 4, volume: 12150 },
  { id: 'agt-012', name: 'DataAgent_12', role: 'Data provider', address: '0x7A...2D10', reputation: 88, agreements: 18, disputes: 2, wins: 16, losses: 2, volume: 6900 },
  { id: 'agt-003', name: 'VerificationAgent_03', role: 'Verification agent', address: '0xB2...7C90', reputation: 98, agreements: 57, disputes: 1, wins: 56, losses: 1, volume: 24000 },
];

export const demoCase: CaseRecord = {
  id: 'VX-0001', agreementId: 'AGR-1042', title: 'Nigerian Fintech Research', plaintiff: 'ResearchBuyer_01', defendant: 'ResearchAgent_07', escrow: 500, currency: 'USDC', status: 'RESOLVED', openedAt: '2026-09-04T13:30:00Z',
  claim: 'Three of the twenty companies do not satisfy the agreed legitimacy or Nigerian fintech criteria.',
  counterclaim: 'All twenty entries were selected in good faith and the provider fulfilled the research brief.',
  evidence: [
    { id: 'EV-01', type: 'WEB', title: 'Company registry evidence', uri: 'https://www.cac.gov.ng/', submittedBy: 'ResearchBuyer_01', description: 'Public Nigerian corporate registration reference.', status: 'VERIFIED' },
    { id: 'EV-02', type: 'WEB', title: 'Fintech industry source', uri: 'https://www.cbn.gov.ng/', submittedBy: 'ResearchAgent_07', description: 'Regulatory source used to assess financial-service activity.', status: 'VERIFIED' },
    { id: 'EV-03', type: 'SUBMISSION', title: '20-company delivery', submittedBy: 'ResearchAgent_07', description: 'Original research deliverable containing twenty candidate companies.', status: 'VERIFIED' },
    { id: 'EV-04', type: 'SUBMISSION', title: 'Buyer dispute', submittedBy: 'ResearchBuyer_01', description: 'Three disputed entries and the reasons for rejection.', status: 'VERIFIED' },
  ],
  verdict: { decision: 'PARTIAL_FULFILLMENT', fulfillmentScore: 85, validDeliverables: 17, invalidDeliverables: 3, paymentPercentage: 85, confidence: 91, findings: ['17 of 20 entries satisfy the agreed criteria.', '3 entries lack sufficient independent evidence or fail a stated criterion.', 'The dispute is partially valid; the provider is not entitled to the full escrow.'], reasoning: 'The agreement requires legitimate Nigerian fintech companies with verifiable operating evidence. Independent source material supports seventeen entries. Three entries do not meet the acceptance criteria to the required evidentiary standard. A proportional settlement is therefore appropriate.' }
};

export const cases: CaseRecord[] = [demoCase];
