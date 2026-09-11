'use client';

import { useEffect, useState } from 'react';
import { parseVerdict, type AdjudicationVerdict } from '@/lib/genlayer/parse-verdict';
import { getAdjudicationTransaction, getEscrowState, settleEscrow, submitAdjudication, type AdjudicationStatus, type VerdictXTransaction } from '@/lib/genlayer/client';

type EthereumProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
declare global { interface Window { ethereum?: EthereumProvider } }

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const value = error as { shortMessage?: unknown; details?: unknown; message?: unknown; cause?: { message?: unknown } };
    if (typeof value.shortMessage === 'string') return value.shortMessage;
    if (typeof value.details === 'string') return value.details;
    if (typeof value.message === 'string') return value.message;
    if (typeof value.cause?.message === 'string') return value.cause.message;
  }
  return 'Adjudication failed for an unknown reason.';
}

const PHASES = ['PENDING', 'PROPOSING', 'LEADER_REVEALING', 'COMMITTING', 'REVEALING', 'ACCEPTED', 'FINALIZED'];
const TERMINAL_FAILURES = ['UNDETERMINED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT', 'CANCELED'];

function labelForStatus(snapshot: AdjudicationStatus | null): string {
  if (!snapshot) return 'IDLE';
  const labels: Record<string, string> = {
    PENDING: 'QUEUED · WAITING FOR ACTIVATION', PROPOSING: 'LEADER PROPOSING', LEADER_REVEALING: 'LEADER REVEALING',
    COMMITTING: 'VALIDATORS COMMITTING', REVEALING: 'VALIDATORS REVEALING', ACCEPTED: 'DECISION ACCEPTED · APPEAL WINDOW',
    FINALIZED: 'FINALIZED', UNDETERMINED: 'UNDETERMINED · NO MAJORITY', VALIDATORS_TIMEOUT: 'VALIDATORS TIMEOUT',
    LEADER_TIMEOUT: 'LEADER TIMEOUT', CANCELED: 'CANCELED',
  };
  return labels[snapshot.status] ?? snapshot.status;
}

function phaseIndex(status: string) { const index = PHASES.indexOf(status); return index < 0 ? -1 : index; }
function Detail({ label, value }: { label: string; value?: string | number | null }) { if (value === undefined || value === null || value === '') return null; return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}><span style={{ color: '#697177' }}>{label}</span><span className="mono" style={{ textAlign: 'right', wordBreak: 'break-word' }}>{String(value)}</span></div>; }

export default function AdjudicationControl({ contractAddress, escrowAddress, agreement, delivery, dispute, evidenceUrls, onVerdict, mode = 'live' }: {
  contractAddress: `0x${string}`;
  escrowAddress: `0x${string}`;
  agreement: string;
  delivery: string;
  dispute: string;
  evidenceUrls: string[];
  onVerdict?: (verdict: AdjudicationVerdict, txHash: VerdictXTransaction) => void;
  mode?: 'live' | 'simulation';
}) {
  const storageKey = `verdictx:pending-adjudication:${contractAddress.toLowerCase()}`;
  const [status, setStatus] = useState('IDLE');
  const [snapshot, setSnapshot] = useState<AdjudicationStatus | null>(null);
  const [tx, setTx] = useState<VerdictXTransaction | ''>('');
  const [wallet, setWallet] = useState<`0x${string}` | ''>('');
  const [escrowReady, setEscrowReady] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settleTx, setSettleTx] = useState<VerdictXTransaction | ''>('');
  const [error, setError] = useState('');

  async function check(hash: VerdictXTransaction) {
    const next = await getAdjudicationTransaction(hash);
    setSnapshot(next); setStatus(labelForStatus(next));
    if (next.status === 'FINALIZED' && next.execution === 'FINISHED_WITH_RETURN') {
      try { const escrow = await getEscrowState(escrowAddress); setEscrowReady(escrow.verdictFinalized && !escrow.settlementBlocked && !escrow.settled); } catch { setEscrowReady(false); }
    }
    return next;
  }

  useEffect(() => {
    const saved = localStorage.getItem(storageKey) as VerdictXTransaction | null;
    if (!saved) return;
    setTx(saved);
    check(saved).catch((e) => { setStatus('TRACKING PAUSED'); setError(getErrorMessage(e)); });
    const timer = window.setInterval(async () => {
      try {
        const next = await check(saved);
        if (next.status === 'FINALIZED' && next.execution === 'FINISHED_WITH_RETURN') {
          const raw = next.raw?.txDataDecoded?.returnData ?? next.raw?.txExecutionResult ?? '';
          if (raw) { localStorage.removeItem(storageKey); onVerdict?.(parseVerdict(String(raw)), saved); }
        }
      } catch (e) { console.error('VerdictX transaction tracking error:', e); }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [storageKey, escrowAddress, onVerdict]);

  async function start() {
    setError('');
    const saved = localStorage.getItem(storageKey) as VerdictXTransaction | null;
    if (saved) { setTx(saved); await check(saved); return; }
    try {
      if (mode === 'simulation') throw new Error('Simulation mode is display-only and cannot submit or settle on-chain transactions.');
      if (!window.ethereum) throw new Error('No EVM wallet detected. Install a browser wallet and connect it to GenLayer Bradbury.');
      setStatus('CONNECTING WALLET');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const address = accounts?.[0];
      if (!address) throw new Error('Wallet returned no account.');
      setWallet(address.toLowerCase() as `0x${string}`);
      setStatus('SUBMITTING TO GENLAYER');
      const hash = await submitAdjudication(address as `0x${string}`, contractAddress, agreement, delivery, dispute, evidenceUrls, window.ethereum);
      localStorage.setItem(storageKey, hash); setTx(hash); await check(hash);
    } catch (e) { setStatus('ERROR'); setError(getErrorMessage(e)); }
  }

  async function settle() {
    if (!tx || !wallet || !window.ethereum) return;
    setError(''); setSettling(true);
    try {
      const hash = await settleEscrow(wallet, escrowAddress, window.ethereum, tx);
      setSettleTx(hash);
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setSettling(false); }
  }

  const busy = ['CONNECTING WALLET', 'SUBMITTING TO GENLAYER'].includes(status);
  const currentPhase = snapshot ? phaseIndex(snapshot.status) : -1;
  const terminalFailure = !!snapshot && TERMINAL_FAILURES.includes(snapshot.status);
  const executionFailed = !!snapshot && ['FINISHED_WITH_ERROR', 'TIMEOUT', 'NONDET_DISAGREE', 'DETERMINISTIC_VIOLATION'].includes(snapshot.execution);
  const buttonLabel = status === 'IDLE' ? 'Start live adjudication →' : status === 'TRACKING PAUSED' ? 'Resume tracking' : status === 'ERROR' ? 'Retry submission' : snapshot?.status === 'FINALIZED' ? 'Adjudication finalized' : snapshot?.status === 'ACCEPTED' ? 'Decision accepted · waiting for finality' : 'Tracking live…';

  return <div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
      <span className="status">{mode === 'live' ? 'ON-CHAIN / GENLAYER' : 'DEMO / SIMULATION'}</span>
      {mode === 'live' && <span className="mono" style={{ fontSize: 10, color: '#697177' }}>Settlement requires FINALIZED consensus</span>}
    </div>
    <button className="btn primary" onClick={start} disabled={busy || mode === 'simulation' || snapshot?.status === 'FINALIZED'}>{buttonLabel}</button>
    {tx && <div className="tx mono">ADJUDICATION TX {tx}</div>}

    {snapshot && <div style={{ marginTop: 14, padding: 14, border: '1px solid rgba(255,255,255,.08)', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}><strong>{labelForStatus(snapshot)}</strong><span className="mono" style={{ fontSize: 10, color: '#697177' }}>{snapshot.execution}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 4, marginBottom: 14 }}>{PHASES.map((phase, index) => { const reached=currentPhase>=index; const active=snapshot.status===phase; return <div key={phase} title={phase} style={{ height: 4, borderRadius: 4, background: reached?'currentColor':'rgba(255,255,255,.08)', opacity: active?1:reached?.65:.35 }} />; })}</div>
      <div className="mono" style={{ fontSize: 10, color: '#697177', marginBottom: 8 }}>STORED {snapshot.status} · PROJECTED {snapshot.projectedStatus ?? snapshot.status}{snapshot.queuePosition != null ? ` · QUEUE ${snapshot.queuePosition}` : ''}</div>
      <Detail label="Lifecycle" value={snapshot.lifecycle} /><Detail label="Execution result" value={snapshot.execution} /><Detail label="Resolution action" value={snapshot.resolutionAction} /><Detail label="Resolution source" value={snapshot.resolutionSource} /><Detail label="Decision active" value={snapshot.decisionActive == null ? undefined : String(snapshot.decisionActive)} /><Detail label="Recipient" value={snapshot.recipient} /><Detail label="Execution hash" value={snapshot.executionHash} />
      {executionFailed && <div className="error" style={{ marginTop: 10 }}>GenLayer reported {snapshot.execution}. The consensus receipt did not contain a successful contract return.</div>}
      {terminalFailure && <div className="error" style={{ marginTop: 10 }}>Consensus did not produce an irreversible result. Settlement remains locked.</div>}
      {snapshot.status === 'ACCEPTED' && <div style={{ marginTop: 10, fontSize: 12, color: '#91989d' }}>Accepted is provisional. An appeal can still change the result. VerdictX deliberately does not unlock settlement here.</div>}
      {snapshot.status === 'FINALIZED' && <div style={{ marginTop: 10, fontSize: 12, color: '#91989d' }}>Finalized consensus is irreversible. The escrow bridge is now the only authorization path for settlement.</div>}
      {snapshot.status === 'FINALIZED' && snapshot.execution === 'FINISHED_WITH_RETURN' && <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.06)' }}>
        <div style={{ fontSize: 12, marginBottom: 8 }}>{escrowReady ? 'ESCROW BRIDGE READY · FINALIZED VERDICT VERIFIED' : 'FINALIZED · WAITING FOR ESCROW BRIDGE MESSAGE'}</div>
        {escrowReady && !settleTx && <button className="btn primary" onClick={settle} disabled={settling}>{settling ? 'WAITING FOR WALLET…' : 'Execute finalized settlement →'}</button>}
        {settleTx && <div className="tx mono">SETTLEMENT TX {settleTx}</div>}
      </div>}
    </div>}
    {error && <div className="error">{error}</div>}
  </div>;
}
