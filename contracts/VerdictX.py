# { "Depends": "py-genlayer:9b8kjyda2ycxyq4ea6g4yfpnydxhd52gqba5rb8dw7krkh5mn9p0" }
from genlayer import *
import json

MAX_EVIDENCE_URLS=3
MAX_TEXT_LENGTH=12000
MAX_URL_LENGTH=2048
MAX_DELIVERABLE_COUNT=100000

def parse_model_output(value):
    if isinstance(value,dict): return value
    if not isinstance(value,str): return None
    text=value.strip()
    if text.startswith("```"):
        lines=text.splitlines()[1:]
        if lines and lines[-1].strip()=="```": lines=lines[:-1]
        text="\n".join(lines).strip()
    try: parsed=json.loads(text); return parsed if isinstance(parsed,dict) else None
    except Exception:
        start=text.find("{"); end=text.rfind("}")
        if start<0 or end<=start: return None
        try: parsed=json.loads(text[start:end+1]); return parsed if isinstance(parsed,dict) else None
        except Exception: return None

class VerdictX(gl.Contract):
    case_id:str; adjudicator:Address; decision:str; fulfillment_score:u256; valid_deliverables:u256; invalid_deliverables:u256; recommended_payment_percentage:u256; confidence:u256; reasoning:str; verdict:str; settled:bool
    def __init__(self,case_id:str):
        self.case_id=case_id; self.adjudicator=gl.message.sender_address; self.decision="PENDING"; self.fulfillment_score=u256(0); self.valid_deliverables=u256(0); self.invalid_deliverables=u256(0); self.recommended_payment_percentage=u256(0); self.confidence=u256(0); self.reasoning=""; self.verdict="PENDING"; self.settled=False
    @gl.public.view
    def get_case(self)->str:return self.case_id
    @gl.public.view
    def get_verdict(self)->str:return self.verdict
    @gl.public.view
    def get_decision(self)->str:return self.decision
    @gl.public.view
    def get_score(self)->u256:return self.fulfillment_score
    @gl.public.view
    def get_payment_percentage(self)->u256:return self.recommended_payment_percentage
    @gl.public.view
    def get_confidence(self)->u256:return self.confidence
    @gl.public.view
    def is_settled(self)->bool:return self.settled
    @gl.public.write
    def adjudicate(self,agreement:str,delivery:str,dispute:str,evidence_urls:list[str])->str:
        if self.decision!="PENDING": raise gl.UserError("Case has already been adjudicated")
        if not agreement.strip() or not delivery.strip() or not dispute.strip(): raise gl.UserError("Agreement, delivery, and dispute are required")
        if max(len(agreement),len(delivery),len(dispute))>MAX_TEXT_LENGTH: raise gl.UserError("Case text exceeds the maximum supported length")
        if len(evidence_urls)>MAX_EVIDENCE_URLS: raise gl.UserError("A maximum of three evidence URLs is supported")
        for url in evidence_urls:
            if not isinstance(url,str) or not url.strip() or len(url)>MAX_URL_LENGTH: raise gl.UserError("Evidence URLs must be non-empty and shorter than 2048 characters")
        def evaluate():
            material=""
            for url in evidence_urls:
                try: material+=f"\nSOURCE {url}\n{str(gl.nondet.web.render(url,mode='text'))[:MAX_TEXT_LENGTH]}"
                except Exception: material+=f"\nSOURCE {url}\nUNAVAILABLE"
            prompt=f"Evaluate the agreement, delivery, dispute and evidence. Return only JSON with decision, fulfillment_score, valid_deliverables, invalid_deliverables, recommended_payment_percentage, confidence, findings, reasoning. Scores/payment/confidence 0-100; counts non-negative.\nAGREEMENT:{agreement}\nDELIVERY:{delivery}\nDISPUTE:{dispute}\nEVIDENCE:{material}"
            return parse_model_output(gl.nondet.exec_prompt(prompt,response_format='json'))
        def validate(leader_result):
            if not isinstance(leader_result,gl.vm.Return) or not isinstance(leader_result.calldata,dict): return False
            try:
                p=leader_result.calldata; i=evaluate(); allowed={"FULL_FULFILLMENT","PARTIAL_FULFILLMENT","NON_FULFILLMENT","INVALID_CASE","INCONCLUSIVE"}; d=str(p.get('decision','')); di=str(i.get('decision','')); ps=int(p.get('fulfillment_score',-1)); ins=int(i.get('fulfillment_score',-1)); pp=int(p.get('recommended_payment_percentage',-1)); ip=int(i.get('recommended_payment_percentage',-1)); pv=int(p.get('valid_deliverables',-1)); iv=int(i.get('valid_deliverables',-1)); pi=int(p.get('invalid_deliverables',-1)); ii=int(i.get('invalid_deliverables',-1))
                return d in allowed and di in allowed and d==di and 0<=ps<=100 and 0<=ins<=100 and 0<=pp<=100 and 0<=ip<=100 and 0<=pv<=MAX_DELIVERABLE_COUNT and 0<=iv<=MAX_DELIVERABLE_COUNT and 0<=pi<=MAX_DELIVERABLE_COUNT and 0<=ii<=MAX_DELIVERABLE_COUNT and abs(ps-ins)<=10 and abs(pp-ip)<=10 and abs(pv-iv)<=1 and abs(pi-ii)<=1
            except Exception:return False
        result=gl.vm.run_nondet_unsafe(evaluate,validate)
        if not isinstance(result,dict): raise gl.UserError("Invalid adjudication result")
        try: d=str(result['decision']); s=int(result['fulfillment_score']); v=int(result['valid_deliverables']); inv=int(result['invalid_deliverables']); pay=int(result['recommended_payment_percentage']); c=int(result['confidence'])
        except Exception: raise gl.UserError("Adjudication returned malformed structured data")
        if d not in {"FULL_FULFILLMENT","PARTIAL_FULFILLMENT","NON_FULFILLMENT","INVALID_CASE","INCONCLUSIVE"} or not 0<=s<=100 or not 0<=pay<=100 or not 0<=c<=100 or not 0<=v<=MAX_DELIVERABLE_COUNT or not 0<=inv<=MAX_DELIVERABLE_COUNT: raise gl.UserError("Invalid adjudication result values")
        self.decision=d; self.fulfillment_score=u256(s); self.valid_deliverables=u256(v); self.invalid_deliverables=u256(inv); self.recommended_payment_percentage=u256(pay); self.confidence=u256(c); self.reasoning=str(result.get('reasoning','')); self.verdict=json.dumps(result,sort_keys=True); return self.verdict
    @gl.public.write
    def mark_settled(self):
        if gl.message.sender_address!=self.adjudicator: raise gl.UserError("Only the case adjudicator can mark settlement")
        if self.decision=="PENDING" or self.settled: raise gl.UserError("Case cannot be marked settled")
        self.settled=True
