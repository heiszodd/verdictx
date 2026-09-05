'use client';

import Link from 'next/link';
import { useState } from 'react';
import { deployVerdictXCase } from '@/lib/genlayer/client';

type EthereumProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
declare global { interface Window { ethereum?: EthereumProvider } }

const INDEX_KEY = 'verdictx:cases';

type StoredCase = {
  id: string;
  title: string;
  task: string;
  criteria: string;
  escrow: string;
  disputeWindow: string;
  provider: string;
  contractAddress: string;
  deploymentTx: string;
  buyer: string;
  createdAt: string;
};

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const value = error as { shortMessage?: unknown; message?: unknown; details?: unknown };
    if (typeof value.shortMessage === 'string') return value.shortMessage;
    if (typeof value.message === 'string') return value.message;
    if (typeof value.details === 'string') return value.details;
  }
  return 'Could not create the agreement.';
}

export default function CreateAgreement() {
  const [title, setTitle] = useState('Nigerian Fintech Research');
  const [escrow, setEscrow] = useState('5');
  const [provider, setProvider] = useState('');
  const [task, setTask] = useState('Research and deliver 20 legitimate Nigerian fintech companies with verifiable operating evidence.');
  const [criteria, setCriteria] = useState('Each company must be a legitimate Nigerian fintech with evidence from credible public sources. Each deliverable is evaluated independently.');
  const [disputeWindow, setDisputeWindow] = useState('48 hours');
  const [status, setStatus] = useState('IDLE');
  const [error, setError] = useState('');

  async function create() {
    setError('');
    try {
      if (!window.ethereum) throw new Error('No browser wallet detected. Install a wallet such as MetaMask.');
      if (!provider.trim()) throw new Error('Provider wallet address is required.');
      if (!/^0x[a-fA-F0-9]{40}$/.test(provider.trim())) throw new Error('Provider address must be a valid EVM address.');
      if (!title.trim() || !task.trim() || !criteria.trim()) throw new Error('Title, task, and acceptance criteria are required.');

      setStatus('CONNECTING WALLET');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const buyer = accounts?.[0];
      if (!buyer) throw new Error('Wallet returned no account.');

      const id = `VX-${Date.now().toString(36).toUpperCase()}`;
      setStatus('DEPLOYING CASE CONTRACT');
      const deployed = await deployVerdictXCase(buyer as `0x${string}`, id, window.ethereum);

      const record: StoredCase = {
        id,
        title: title.trim(),
        task: task.trim(),
        criteria: criteria.trim(),
        escrow: escrow.trim(),
        disputeWindow: disputeWindow.trim(),
        provider: provider.trim(),
        contractAddress: deployed.address,
        deploymentTx: deployed.hash,
        buyer,
        createdAt: new Date().toISOString(),
      };
      const existing = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]') as StoredCase[];
      localStorage.setItem(INDEX_KEY, JSON.stringify([record, ...existing.filter((item) => item.contractAddress !== record.contractAddress)]));
      setStatus('CREATED');
      window.location.href = `/case/${id.toLowerCase()}`;
    } catch (e) {
      setStatus('ERROR');
      setError(errorMessage(e));
    }
  }

  const busy = status === 'CONNECTING WALLET' || status === 'DEPLOYING CASE CONTRACT';

  return <main className="shell"><nav className="nav"><Link href="/" className="brand"><span className="mark">V</span>VERDICTX</Link><div className="navlinks"><Link href="/dashboard">Dashboard</Link><Link href="/cases">Cases</Link><Link href="/agents">Agents</Link></div></nav><div className="formwrap"><div className="eyebrow">Agreement engine / New commitment</div><h1>Create an agreement</h1><p className="muted intro">Deploy a real case contract to GenLayer Bradbury. The contract address and deployment transaction are saved with the case.</p><div className="formgrid"><label>Title<input value={title} onChange={(e)=>setTitle(e.target.value)} /></label><label>Escrow target (GEN)<input inputMode="decimal" value={escrow} onChange={(e)=>setEscrow(e.target.value)} /></label><label>Provider wallet<input placeholder="0x..." value={provider} onChange={(e)=>setProvider(e.target.value)} /></label><label>Dispute window<input value={disputeWindow} onChange={(e)=>setDisputeWindow(e.target.value)} /></label><label className="full">Task<textarea value={task} onChange={(e)=>setTask(e.target.value)} /></label><label className="full">Acceptance criteria<textarea value={criteria} onChange={(e)=>setCriteria(e.target.value)} /></label></div><div className="formactions"><Link href="/agreements" className="btn">Cancel</Link><button className="btn primary" onClick={create} disabled={busy}>{busy ? status : 'Deploy agreement →'}</button></div>{error&&<div className="error">{error}</div>}<div className="notice">The case contract is real and deployed through GenLayerJS. Funding is intentionally not represented as a fake success state; the live escrow rail will be wired after the contract deployment is verified.</div></div></main>;
}
