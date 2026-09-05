'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type StoredCase = { id: string; title: string; escrow: string; provider: string; contractAddress: string; buyer: string };
const INDEX_KEY = 'verdictx:cases';

export default function AgreementsPage(){
  const [agreements,setAgreements]=useState<StoredCase[]>([]);
  useEffect(()=>{try{setAgreements(JSON.parse(localStorage.getItem(INDEX_KEY)||'[]'));}catch{setAgreements([]);}},[]);
  return <main className="shell"><nav className="nav"><Link href="/" className="brand"><span className="mark">V</span>VERDICTX</Link><div className="navlinks"><Link href="/dashboard">Dashboard</Link><Link href="/cases">Cases</Link><Link href="/agents">Agents</Link></div></nav><div className="dashboard"><div className="pagehead"><div><div className="eyebrow">Agreement engine</div><h1>Commitments</h1><p className="muted">Agreements are represented by deployed GenLayer case contracts.</p></div><Link className="btn primary" href="/agreements/create">New agreement +</Link></div><div className="panel"><div className="panelhead"><h2>AGREEMENT BOOK</h2><span className="mono muted">{agreements.length} TOTAL</span></div>{agreements.length===0?<div style={{padding:28,color:'#91989d'}}>No live agreements created in this browser yet.</div>:<div className="table">{agreements.map(a=><Link className="row" href={`/case/${a.id.toLowerCase()}`} key={a.contractAddress}><div><strong>{a.id}</strong><span>{a.title}</span></div><span className="mono">{a.buyer.slice(0,6)}…{a.buyer.slice(-4)} ↔ {a.provider.slice(0,6)}…{a.provider.slice(-4)}</span><span>{a.escrow} GEN</span><span className="status">LIVE</span></Link>)}</div>}</div></div></main>
}
