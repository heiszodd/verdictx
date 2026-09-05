'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import AdjudicationControl from '@/components/AdjudicationControl';
import { fundEscrow, getEscrowState, getVerdictForContract, settleEscrow } from '@/lib/genlayer/client';
import { parseVerdict, type AdjudicationVerdict } from '@/lib/genlayer/parse-verdict';

type EthereumProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
declare global { interface Window { ethereum?: EthereumProvider } }

type StoredCase={id:string;title:string;task:string;criteria:string;escrow:string;disputeWindow:string;provider:string;contractAddress:string;deploymentTx:string;buyer:string;createdAt:string};
const INDEX_KEY='verdictx:cases';

function short(value:string){return `${value.slice(0,8)}…${value.slice(-6)}`;}
function errorMessage(error:unknown){if(error instanceof Error&&error.message)return error.message;if(error&&typeof error==='object'){const v=error as {shortMessage?:unknown;message?:unknown;details?:unknown};if(typeof v.shortMessage==='string')return v.shortMessage;if(typeof v.message==='string')return v.message;if(typeof v.details==='string')return v.details;}return 'Transaction failed.';}

export default function CasePage(){
  const params=useParams<{id:string}>();
  const [record,setRecord]=useState<StoredCase|null>(null);
  const [verdict,setVerdict]=useState<AdjudicationVerdict|null>(null);
  const [escrowState,setEscrowState]=useState<{amount:number;funded:boolean;settled:boolean;decision:string;paymentPercentage:number;providerAmount:number;buyerRefund:number}|null>(null);
  const [delivery,setDelivery]=useState('');
  const [dispute,setDispute]=useState('');
  const [evidence,setEvidence]=useState('');
  const [funding,setFunding]=useState(false);
  const [settling,setSettling]=useState(false);
  const [fundTx,setFundTx]=useState('');
  const [settleTx,setSettleTx]=useState('');
  const [loadError,setLoadError]=useState('');
  const [actionError,setActionError]=useState('');

  useEffect(()=>{
    try{
      const all=JSON.parse(localStorage.getItem(INDEX_KEY)||'[]') as StoredCase[];
      const found=all.find((item)=>item.id.toLowerCase()===String(params.id).toLowerCase());
      if(!found){setLoadError('This case is not indexed in this browser.');return;}
      setRecord(found); setDelivery(`Provider delivery for ${found.title}.`);
      setFundTx(localStorage.getItem(`verdictx:fund:${found.contractAddress.toLowerCase()}`)||'');
      setSettleTx(localStorage.getItem(`verdictx:settle:${found.contractAddress.toLowerCase()}`)||'');
      const savedVerdict=localStorage.getItem(`verdictx:verdict:${found.contractAddress.toLowerCase()}`);
      if(savedVerdict) try{setVerdict(parseVerdict(savedVerdict));}catch{}
      getVerdictForContract(found.contractAddress as `0x${string}`).then((raw)=>{if(raw&&String(raw)!=='PENDING'){const parsed=parseVerdict(String(raw));setVerdict(parsed);localStorage.setItem(`verdictx:verdict:${found.contractAddress.toLowerCase()}`,JSON.stringify(parsed));}}).catch(()=>{});
    }catch(e){setLoadError(e instanceof Error?e.message:'Could not load case.');}
  },[params.id]);

  useEffect(()=>{
    if(!record)return;
    let active=true;
    const refresh=async()=>{try{const state=await getEscrowState(record.contractAddress as `0x${string}`);if(active)setEscrowState(state);}catch{}}
    refresh(); const timer=window.setInterval(refresh,8000); return()=>{active=false;window.clearInterval(timer)};
  },[record]);

  async function fund(){
    if(!record||!window.ethereum)return;
    setActionError('');setFunding(true);
    try{
      const accounts=await window.ethereum.request({method:'eth_requestAccounts'}) as string[]; const buyer=accounts?.[0];
      if(!buyer)throw new Error('Wallet returned no account.');
      if(buyer.toLowerCase()!==record.buyer.toLowerCase())throw new Error('Connect the buyer wallet used to create this agreement.');
      const hash=await fundEscrow(buyer as `0x${string}`,record.contractAddress as `0x${string}`,record.escrow,window.ethereum);
      setFundTx(hash);localStorage.setItem(`verdictx:fund:${record.contractAddress.toLowerCase()}`,hash);
      setTimeout(async()=>{try{setEscrowState(await getEscrowState(record.contractAddress as `0x${string}`));}catch{}},4000);
    }catch(e){setActionError(errorMessage(e));}finally{setFunding(false)}
  }

  async function settle(){
    if(!record||!window.ethereum)return;
    setActionError('');setSettling(true);
    try{
      const accounts=await window.ethereum.request({method:'eth_requestAccounts'}) as string[]; const buyer=accounts?.[0];
      if(!buyer)throw new Error('Wallet returned no account.');
      if(buyer.toLowerCase()!==record.buyer.toLowerCase())throw new Error('Connect the buyer wallet used to create this agreement.');
      const hash=await settleEscrow(buyer as `0x${string}`,record.contractAddress as `0x${string}`,window.ethereum);
      setSettleTx(hash);localStorage.setItem(`verdictx:settle:${record.contractAddress.toLowerCase()}`,hash);
      setTimeout(async()=>{try{setEscrowState(await getEscrowState(record.contractAddress as `0x${string}`));}catch{}},4000);
    }catch(e){setActionError(errorMessage(e));}finally{setSettling(false)}
  }

  if(loadError)return <main className="shell"><nav className="nav"><Link href="/" className="brand"><span className="mark">V</span>VERDICTX</Link><div className="navlinks"><Link href="/dashboard">Dashboard</Link><Link href="/cases">Cases</Link><Link href="/agents">Agents</Link></div></nav><div className="dashboard"><div className="panel" style={{padding:28}}><h2>Case unavailable</h2><p className="muted" style={{marginTop:8}}>{loadError}</p><Link href="/cases" className="btn" style={{marginTop:18}}>Back to cases</Link></div></div></main>;
  if(!record)return <main className="shell"><div className="dashboard"><div className="panel" style={{padding:28}}>Loading live case…</div></div></main>;

  const evidenceUrls=evidence.split('\n').map((x)=>x.trim()).filter(Boolean).slice(0,3);
  const funded=escrowState?.funded??false; const settled=escrowState?.settled??false; const canSettle=funded&&!settled&&!!verdict;
  return <main className="shell"><nav className="nav"><Link href="/" className="brand"><span className="mark">V</span>VERDICTX</Link><div className="navlinks"><Link href="/dashboard">Dashboard</Link><Link href="/cases">Cases</Link><Link href="/agents">Agents</Link></div><span className="mono navtag">{record.id}</span></nav><div className="dashboard"><div className="pagehead"><div><div className="eyebrow">Live case / {record.id}</div><h1>{record.title}</h1><p className="muted">Buyer {short(record.buyer)} · Provider {short(record.provider)}</p></div><span className="status">GENLAYER / LIVE</span></div>

  <section className="panel" style={{marginBottom:12}}><div className="panelhead"><h2>ESCROW</h2><span className="status">{settled?'SETTLED':funded?'FUNDED':'UNFUNDED'}</span></div><div style={{padding:22}}><div className="kv"><span>Contract</span><strong className="mono">{record.contractAddress}</strong></div><div className="kv"><span>Target</span><strong>{record.escrow} GEN</strong></div><div className="kv"><span>On-chain amount</span><strong>{escrowState?`${escrowState.amount} GEN`:'Loading…'}</strong></div>{funded&&<><div className="kv"><span>Recommended payment</span><strong>{escrowState?.paymentPercentage ?? verdict?.recommended_payment_percentage ?? 0}%</strong></div>{settled&&<><div className="kv"><span>Provider payout</span><strong>{escrowState?.providerAmount ?? 0} GEN</strong></div><div className="kv"><span>Buyer refund</span><strong>{escrowState?.buyerRefund ?? 0} GEN</strong></div></>}</>}<div style={{marginTop:18,display:'flex',gap:10,flexWrap:'wrap'}}>{!funded&&!fundTx&&<button className="btn primary" onClick={fund} disabled={funding}>{funding?'WAITING FOR WALLET…':`Fund ${record.escrow} GEN`}</button>}{fundTx&&<span className="mono muted" style={{alignSelf:'center'}}>Funding TX: {short(fundTx)}</span>}{canSettle&&!settleTx&&<button className="btn primary" onClick={settle} disabled={settling}>{settling?'WAITING FOR WALLET…':`Settle ${escrowState?.paymentPercentage ?? verdict?.recommended_payment_percentage ?? 0}%`}</button>}{settleTx&&<span className="mono muted" style={{alignSelf:'center'}}>Settlement TX: {short(settleTx)}</span>}</div>{actionError&&<div className="error" style={{marginTop:14}}>{actionError}</div>}<p className="muted" style={{marginTop:14,lineHeight:1.6}}>Funding sends native GEN into the case contract. Settlement is only available after a live GenLayer verdict and sends the recorded split to the provider and buyer on finalization.</p></div></section>

  <div className="casegrid"><section className="panel"><div className="panelhead"><h2>CASE DATA</h2><span className="mono muted">ON-CHAIN CONTRACT</span></div><div style={{padding:22}}><div className="kv"><span>Deployment TX</span><strong className="mono">{record.deploymentTx}</strong></div><div className="kv"><span>Dispute window</span><strong>{record.disputeWindow}</strong></div><div style={{marginTop:22}}><div className="eyebrow">Agreement task</div><p className="muted" style={{marginTop:8,lineHeight:1.7}}>{record.task}</p><div className="eyebrow" style={{marginTop:18}}>Acceptance criteria</div><p className="muted" style={{marginTop:8,lineHeight:1.7}}>{record.criteria}</p></div></div></section><aside className="panel"><div className="panelhead"><h2>VERDICT</h2><span className="status">{verdict?'LIVE':'PENDING'}</span></div><div className="side">{verdict?<><div className="eyebrow">{verdict.decision.replaceAll('_',' ')}</div><div className="big">{verdict.fulfillment_score}%</div><div className="bar"><i style={{width:`${verdict.fulfillment_score}%`}}/></div><div className="kv"><span>Valid</span><strong>{verdict.valid_deliverables}</strong></div><div className="kv"><span>Invalid</span><strong>{verdict.invalid_deliverables}</strong></div><div className="kv"><span>Confidence</span><strong>{verdict.confidence}%</strong></div><div className="verdict"><div className="eyebrow">Recommended payment</div><div className="big" style={{fontSize:28}}>{verdict.recommended_payment_percentage}%</div></div></>:<p className="muted">No finalized verdict is stored for this contract yet. Submit the case below for real GenLayer adjudication.</p>}</div></aside></div>

  <section className="panel" style={{marginTop:12}}><div className="panelhead"><h2>SUBMIT FOR ADJUDICATION</h2><span className="mono muted">MAX 3 EVIDENCE URLS</span></div><div style={{padding:22}}><label>Delivery<textarea value={delivery} onChange={(e)=>setDelivery(e.target.value)} placeholder="Describe the actual deliverable submitted by the provider." /></label><label style={{display:'block',marginTop:16}}>Dispute<textarea value={dispute} onChange={(e)=>setDispute(e.target.value)} placeholder="State the specific disagreement to be adjudicated." /></label><label style={{display:'block',marginTop:16}}>Evidence URLs<textarea value={evidence} onChange={(e)=>setEvidence(e.target.value)} placeholder="One public URL per line (maximum 3)." /></label><div style={{marginTop:18}}><AdjudicationControl contractAddress={record.contractAddress as `0x${string}`} agreement={`${record.task}\n\nACCEPTANCE CRITERIA:\n${record.criteria}`} delivery={delivery} dispute={dispute} evidenceUrls={evidenceUrls} onVerdict={(v)=>{setVerdict(v);localStorage.setItem(`verdictx:verdict:${record.contractAddress.toLowerCase()}`,JSON.stringify(v));}}/></div></div></section>{verdict&&<section className="panel" style={{marginTop:12}}><div className="panelhead"><h2>ADJUDICATOR REASONING</h2><span className="mono muted">GENLAYER</span></div><div style={{padding:22,color:'#91989d',lineHeight:1.8}}><p>{verdict.reasoning}</p>{verdict.findings.map((f,i)=><div className="finding" key={i}><span>0{i+1}</span>{f}</div>)}</div></section>}</div></main>;
}
