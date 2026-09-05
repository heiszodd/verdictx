'use client';

import { useEffect, useState } from 'react';
import { parseVerdict, type AdjudicationVerdict } from '@/lib/genlayer/parse-verdict';
import {
  getAdjudicationTransaction,
  requireContractAddress,
  submitAdjudication,
  type AdjudicationStatus,
  type VerdictXTransaction,
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
    return snapshot.queuePosition != null ? `QUEUED · POSITION ${snapshot.queuePosition}` : 'QUEUED · WAITING FOR ACTIVATION';
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

  async function check(hash: VerdictXTransaction) {
    const next = await getAdjudicationTransaction(hash);
    setSnapshot(next);
    setStatus(labelForStatus(next));
    return next;
  }

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as VerdictXTransaction | null;
    if (!saved) return;
    setTx(saved);
    check(saved).catch((e) => {
      setStatus('TRACKING PAUSED');
      setError(getErrorMessage(e));
    });

    const timer = window.setInterval(async () => {
      try {
        const next = await check(saved);
        if (['ACCEPTED', 'FINALIZED'].includes(next.status)) {
          const raw = next.raw?.txDataDecoded?.returnData ?? next.raw?.txExecutionResult ?? '';
          if (raw) {
            localStorage.removeItem(STORAGE_KEY);
            onVerdict?.(parseVerdict(String(raw)));
          }
          window.clearInterval(timer);
        }
      } catch (e) {
        console.error('VerdictX transaction tracking error:', e);
      }
    }, 10000);

    return () => window.clearInterval(timer);
  }, [onVerdict]);

  async function start() {
    setError('');
    const saved = localStorage.getItem(STORAGE_KEY) as VerdictXTransaction | null;
    if (saved) {
      setTx(saved);
      await check(saved);
      return;
    }

    try {
      requireContractAddress();
      if (!window.ethereum) throw new Error('No EVM wallet detected. Install a browser wallet and connect it to GenLayer Bradbury.');
      setStatus('CONNECTING WALLET');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const address = accounts?.[0];
      if (!address) throw new Error('Wallet returned no account.');
      setStatus('SUBMITTING TO GENLAYER');
      const hash = await submitAdjudication(address as `0x${string}`, agreement, delivery, dispute, evidenceUrls, window.ethereum);
      localStorage.setItem(STORAGE_KEY, hash);
      setTx(hash);
      await check(hash);
    } catch (e) {
      console.error('VerdictX adjudication error:', e);
      setStatus('ERROR');
      setError(getErrorMessage(e));
    }
  }

  const buttonLabel = status === 'IDLE' ? 'Start live adjudication →' : status === 'TRACKING PAUSED' ? 'Resume tracking' : status === 'ERROR' ? 'Retry submission' : status === 'PENDING' ? 'Awaiting GenLayer…' : status;
  const busy = ['CONNECTING WALLET', 'SUBMITTING TO GENLAYER'].includes(status);

  return <div>
    <button className="btn primary" onClick={start} disabled={busy}>
      {buttonLabel}
    </button>
    {tx && <div className="tx mono">TX {tx}</div>}
    {snapshot && <div className="mono" style={{marginTop:8,fontSize:10,color:'#697177'}}>
      {snapshot.execution} · {snapshot.lifecycle || 'PROCESSING'}{snapshot.queuePosition != null ? ` · QUEUE ${snapshot.queuePosition}` : ''}
    </div>}
    {snapshot?.status === 'PENDING' && <div style={{marginTop:10,fontSize:12,color:'#91989d'}}>Case submitted. GenLayer is processing the adjudication in the background. You can leave this page and return later.</div>}
    {error && <div className="error">{error}</div>}
  </div>;
}
