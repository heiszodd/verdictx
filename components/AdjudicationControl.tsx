'use client';

import { useEffect, useState } from 'react';
import { parseVerdict, type AdjudicationVerdict } from '@/lib/genlayer/parse-verdict';
import {
  getAdjudicationTransaction,
  requireContractAddress,
  submitAdjudication,
  type AdjudicationStatus,
  type VerdictXTransaction,
  waitForAdjudication,
} from '@/lib/genlayer/client';

const agreement = 'Deliver 20 legitimate Nigerian fintech companies with verifiable operating evidence. Each entry must satisfy the geographic and company-type criteria.';
const delivery = 'ResearchAgent_07 submitted 20 company entries with URLs and descriptions.';
const dispute = 'ResearchBuyer_01 disputes entries 4, 11, and 18 because the evidence does not establish that they satisfy the agreed criteria.';
const evidenceUrls = ['https://www.cbn.gov.ng/', 'https://www.nibss-plc.com.ng/'];
const STORAGE_KEY = 'verdictx:pending-adjudication';

type EthereumProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
declare global { interface Window { ethereum?: EthereumProvider } }

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const value = error as { shortMessage?: unknown; details?: unknown; message?: unknown; cause?: { message?: unknown } };
    if (typeof value.shortMessage === 'string') return value.shortMessage;
    if (typeof value.details === 'string') return value.details;
    if (typeof value.message === 'string') return value.message;
    if (typeof value.cause?.message === 'string') return value.cause.message;
  }
  return 'Adjudication failed for an unknown reason.';
}

function labelForStatus(snapshot: AdjudicationStatus | null): string {
  if (!snapshot) return 'IDLE';
  if (snapshot.status === 'PENDING') {
    return snapshot.queuePosition != null
      ? `QUEUED · POSITION ${snapshot.queuePosition}`
      : 'QUEUED · WAITING FOR ACTIVATION';
  }
  if (snapshot.status === 'PROPOSING') return 'LEADER PROPOSING';
  if (snapshot.status === 'COMMITTING') return 'VALIDATORS COMMITTING';
  if (snapshot.status === 'LEADER_REVEALING') return 'LEADER REVEALING';
  if (snapshot.status === 'REVEALING') return 'VALIDATORS REVEALING';
  if (snapshot.status === 'ACCEPTED') return 'DECISION ACCEPTED';
  if (snapshot.status === 'FINALIZED') return 'FINALIZED';
  return snapshot.status;
}

export default function AdjudicationControl({ onVerdict }: { onVerdict?: (verdict: AdjudicationVerdict) => void }) {
  const [status, setStatus] = useState('IDLE');
  const [snapshot, setSnapshot] = useState<AdjudicationStatus | null>(null);
  const [tx, setTx] = useState<VerdictXTransaction | ''>('');
  const [error, setError] = useState('');
  const [recovering, setRecovering] = useState(false);

  async function track(hash: VerdictXTransaction) {
    setTx(hash);
    setStatus('CHECKING TRANSACTION');
    try {
      const receipt = await waitForAdjudication(hash, (next) => {
        setSnapshot(next);
        setStatus(labelForStatus(next));
      });
      localStorage.removeItem(STORAGE_KEY);
      const raw = receipt?.txDataDecoded?.returnData ?? receipt?.txExecutionResult ?? '';
      if (!raw) throw new Error('Decision reached but no return payload was exposed by the client.');
      onVerdict?.(parseVerdict(String(raw)));
      setStatus('DECISION REACHED');
    } catch (e) {
      // A timeout after a successful submission is not a failed submission.
      // Keep the hash so the next visit can resume the same transaction.
      setError(getErrorMessage(e));
      setStatus('TRACKING PAUSED');
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as VerdictXTransaction | null;
    if (!saved) return;
    setRecovering(true);
    setTx(saved);
    getAdjudicationTransaction(saved)
      .then((next) => {
        setSnapshot(next);
        setStatus(labelForStatus(next));
        return track(saved);
      })
      .catch((e) => {
        localStorage.removeItem(STORAGE_KEY);
        setRecovering(false);
        setStatus('IDLE');
        setError(getErrorMessage(e));
      });
  }, []);

  async function start() {
    setError('');
    setSnapshot(null);
    try {
      requireContractAddress();
      if (!window.ethereum) throw new Error('No EVM wallet detected. Install a browser wallet and connect it to GenLayer Bradbury.');
      setStatus('CONNECTING WALLET');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const address = accounts?.[0];
      if (!address) throw new Error('Wallet returned no account.');
      setStatus('SUBMITTING TO GENLAYER');
      const hash = await submitAdjudication(address as `0x${string}`, agreement, delivery, dispute, evidenceUrls, window.ethereum);
      // Persist immediately. From this point onward we never resubmit automatically.
      localStorage.setItem(STORAGE_KEY, hash);
      setTx(hash);
      await track(hash);
    } catch (e) {
      console.error('VerdictX adjudication error:', e);
      setStatus('ERROR');
      setError(getErrorMessage(e));
    }
  }

  const busy = status !== 'IDLE' && status !== 'ERROR' && status !== 'TRACKING PAUSED';

  return <div>
    <button className="btn primary" onClick={start} disabled={busy || recovering}>
      {status === 'IDLE' ? 'Start live adjudication →' : status === 'ERROR' ? 'Retry adjudication' : status === 'TRACKING PAUSED' ? 'Resume adjudication' : status}
    </button>
    {tx && <div className="tx mono">TX {tx}</div>}
    {snapshot && <div className="mono" style={{marginTop:8,fontSize:10,color:'#697177'}}>
      {snapshot.execution} · {snapshot.lifecycle || 'PROCESSING'}{snapshot.queuePosition != null ? ` · QUEUE ${snapshot.queuePosition}` : ''}
    </div>}
    {error && <div className="error">{error}</div>}
  </div>;
}
