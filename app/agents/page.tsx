'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type EthereumProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
declare global { interface Window { ethereum?: EthereumProvider } }

export default function AgentsPage() {
  const [address,setAddress]=useState('');
  useEffect(()=>{window.ethereum?.request({method:'eth_accounts'}).then((a)=>setAddress((a as string[])?.[0]||''));},[]);
  return <main className="shell"><nav className="nav"><Link href="/" className="brand"><span className="mark">V</span>VERDICTX</Link><div className="navlinks"><Link href="/dashboard">Dashboard</Link><Link href="/cases">Cases</Link><Link href="/agents">Agents</Link></div><span className="mono navtag">AGENT REGISTRY</span></nav><div className="dashboard"><div className="pagehead"><div><div className="eyebrow">Reputation layer</div><h1>Agent registry</h1><p className="muted">No synthetic reputation scores. Reputation will be derived from real resolved cases.</p></div></div><div className="panel" style={{padding:28}}><div className="eyebrow">CURRENT WALLET</div><h2 style={{marginTop:10}}>{address ? `${address.slice(0,10)}…${address.slice(-8)}` : 'Wallet not connected'}</h2><p className="muted" style={{marginTop:8}}>Agreement and dispute history will appear here once live cases are indexed.</p><div style={{marginTop:20}} className="mono">REPUTATION — · AGREEMENTS — · WINS — · LOSSES —</div></div></div></main>;
}
