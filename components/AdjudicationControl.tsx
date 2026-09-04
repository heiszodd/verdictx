'use client';

import { useState } from 'react';
import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { parseVerdict, type AdjudicationVerdict } from '@/lib/genlayer/parse-verdict';
import { requireContractAddress, submitAdjudication, waitForAdjudication } from '@/lib/genlayer/client';

const agreement = 'Deliver 20 legitimate Nigerian fintech companies with verifiable operating evidence. Each entry must satisfy the geographic and company-type criteria.';
const delivery = 'ResearchAgent_07 submitted 20 company entries with URLs and descriptions.';
const dispute = 'ResearchBuyer_01 disputes entries 4, 11, and 18 because the evidence does not establish that they satisfy the agreed criteria.';
const evidenceUrls = ['https://www.cbn.gov.ng/', 'https://www.nibss-plc.com.ng/'];

type EthereumProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

declare global { interface Window { ethereum?: EthereumProvider } }

export default function AdjudicationControl({ onVerdict }: { onVerdict?: (verdict: AdjudicationVerdict) => void }) {
  const [status, setStatus] = useState('IDLE');
  const [tx, setTx] = useState('');
  const [error, setError] = useState('');

  async function start() {
    setError('');
    try {
      const contract = requireContractAddress();
      if (!contract || contract === '0x0000000000000000000000000000000000000000') throw new Error('Set NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS to a deployed contract before using live adjudication.');
      if (!window.ethereum) throw new Error('No EVM wallet detected. Install a browser wallet and connect it to GenLayer Bradbury.');

      setStatus('CONNECTING WALLET');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const address = accounts?.[0];
      if (!address) throw new Error('Wallet returned no account.');

      const client = createClient({ chain: testnetBradbury, account: address, provider: window.ethereum });
      await client.connect('testnetBradbury');

      setStatus('ESTIMATING FEES');
      const hash = await submitAdjudication(address, agreement, delivery, dispute, evidenceUrls);
      setTx(hash);
      setStatus('CONSENSUS IN PROGRESS');

      const receipt = await waitForAdjudication(hash);
      const raw = receipt?.txDataDecoded?.returnData ?? receipt?.txExecutionResult ?? receipt?.data ?? '';
      const verdict = parseVerdict(String(raw));
      onVerdict?.(verdict);
      setStatus('DECISION REACHED');
    } catch (e) {
      setStatus('ERROR');
      setError(e instanceof Error ? e.message : 'Adjudication failed.');
    }
  }

  return <div>
    <button className="btn primary" onClick={start} disabled={status !== 'IDLE' && status !== 'ERROR'}>
      {status === 'IDLE' ? 'Start live adjudication →' : status === 'ERROR' ? 'Retry adjudication' : status}
    </button>
    {tx && <div className="tx mono">TX {tx}</div>}
    {error && <div className="error">{error}</div>}
  </div>;
}
