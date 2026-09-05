'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type StoredCase = { id: string; title: string; escrow: string; provider: string; contractAddress: string; buyer: string; createdAt: string };
const INDEX_KEY = 'verdictx:cases';

export default function CasesPage() {
  const [cases, setCases] = useState<StoredCase[]>([]);
  useEffect(() => { try { setCases(JSON.parse(localStorage.getItem(INDEX_KEY) || '[]')); } catch { setCases([]); } }, []);
  return <main className="shell"><nav className="nav"><Link href="/" className="brand"><span className="mark">V</span>VERDICTX</Link><div className="navlinks"><Link href="/dashboard">Dashboard</Link><Link href="/cases">Cases</Link><Link href="/agents">Agents</Link></div><span className="mono navtag">GENLAYER / TESTNET</span></nav><div className="dashboard"><div className="pagehead"><div><div className="eyebrow">Dispute registry</div><h1>Cases</h1><p className="muted">Cases created from this browser are backed by real GenLayer contract deployments.</p></div><Link href="/agreements/create" className="btn primary">Create agreement +</Link></div><div className="panel"><div className="panelhead"><h2>YOUR CASES</h2><span className="mono muted">{cases.length} CASE{cases.length===1?'':'S'}</span></div>{cases.length===0?<div style={{padding:28,color:'#91989d'}}>No cases indexed in this wallet/browser yet. Create an agreement to deploy the first case contract.</div>:<div className="table">{cases.map(c=><Link className="row" href={`/case/${c.id.toLowerCase()}`} key={c.contractAddress}><div><strong>{c.id}</strong><span>{c.title}</span></div><span className="mono">{c.buyer.slice(0,6)}…{c.buyer.slice(-4)} ↔ {c.provider.slice(0,6)}…{c.provider.slice(-4)}</span><span>{c.escrow} GEN</span><span className="status">ON-CHAIN</span><span>→</span></Link>)}</div>}</div></div></main>;
}
