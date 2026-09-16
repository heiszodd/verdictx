# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json

MAX_EVIDENCE_URLS = 3
MAX_TEXT_LENGTH = 12000
MAX_URL_LENGTH = 2048
MAX_DELIVERABLE_COUNT = 100000
ALLOWED_DECISIONS = {"FULL_FULFILLMENT", "PARTIAL_FULFILLMENT", "NON_FULFILLMENT", "INVALID_CASE", "INCONCLUSIVE"}


def parse_model_output(value):
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return None
    text = value.strip()
    if text.startswith("```"):
        lines = text.splitlines()[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            parsed = json.loads(text[start : end + 1])
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None


class VerdictX(gl.Contract):
    case_id: str
    buyer: Address
    provider: Address
    escrow: Address
    adjudicator: Address
    decision: str
    fulfillment_score: u256
    valid_deliverables: u256
    invalid_deliverables: u256
    recommended_payment_percentage: u256
    confidence: u256
    reasoning: str
    verdict: str
    bridge_emitted: bool
    settled: bool

    def __init__(self, case_id: str, provider: Address, escrow: Address):
        self.case_id = case_id
        self.buyer = gl.message.sender_address
        self.provider = provider
        self.escrow = escrow
        self.adjudicator = gl.message.sender_address
        self.decision = "PENDING"
        self.fulfillment_score = u256(0)
        self.valid_deliverables = u256(0)
        self.invalid_deliverables = u256(0)
        self.recommended_payment_percentage = u256(0)
        self.confidence = u256(0)
        self.reasoning = ""
        self.verdict = "PENDING"
        self.bridge_emitted = False
        self.settled = False

    @gl.public.view
    def get_case(self) -> str: return self.case_id
    @gl.public.view
    def get_buyer(self) -> Address: return self.buyer
    @gl.public.view
    def get_provider(self) -> Address: return self.provider
    @gl.public.view
    def get_escrow(self) -> Address: return self.escrow
    @gl.public.view
    def get_verdict(self) -> str: return self.verdict
    @gl.public.view
    def get_decision(self) -> str: return self.decision
    @gl.public.view
    def get_score(self) -> u256: return self.fulfillment_score
    @gl.public.view
    def get_payment_percentage(self) -> u256: return self.recommended_payment_percentage
    @gl.public.view
    def get_confidence(self) -> u256: return self.confidence
    @gl.public.view
    def is_bridge_emitted(self) -> bool: return self.bridge_emitted
    @gl.public.view
    def is_settled(self) -> bool: return self.settled

    @gl.public.write
    def adjudicate(self, agreement: str, delivery: str, dispute: str, evidence_urls_json: str) -> str:
        if gl.message.sender_address != self.buyer: raise gl.UserError("only the buyer can adjudicate this case")
        if self.decision != "PENDING": raise gl.UserError("case has already been adjudicated")
        if not agreement.strip() or not delivery.strip() or not dispute.strip(): raise gl.UserError("agreement, delivery, and dispute are required")
        if max(len(agreement), len(delivery), len(dispute)) > MAX_TEXT_LENGTH: raise gl.UserError("case text exceeds the maximum supported length")
        try:
            urls = json.loads(evidence_urls_json) if evidence_urls_json else []
        except Exception:
            raise gl.UserError("evidence_urls_json must be a valid JSON array")
        if not isinstance(urls, list): raise gl.UserError("evidence_urls_json must be a JSON array")
        if len(urls) > MAX_EVIDENCE_URLS: raise gl.UserError("a maximum of three evidence URLs is supported")
        for url in urls:
            if not isinstance(url, str) or not url.strip() or len(url) > MAX_URL_LENGTH: raise gl.UserError("evidence URLs must be non-empty and shorter than 2048 characters")
        def evaluate():
            material = ""
            for url in urls:
                try: material += f"\nSOURCE {url}\n{str(gl.nondet.web.render(url, mode='text'))[:MAX_TEXT_LENGTH]}"
                except Exception: material += f"\nSOURCE {url}\nUNAVAILABLE"
            prompt = f'''You are the impartial adjudicator for VerdictX. Evaluate the agreement, delivery, dispute, and external evidence. Never invent unavailable facts. Return ONLY JSON with decision, fulfillment_score, valid_deliverables, invalid_deliverables, recommended_payment_percentage, confidence, findings, and reasoning. decision must be FULL_FULFILLMENT, PARTIAL_FULFILLMENT, NON_FULFILLMENT, INVALID_CASE, or INCONCLUSIVE. Scores and payment/confidence are 0-100; counts are non-negative integers.\nAGREEMENT:\n{agreement}\nDELIVERY:\n{delivery}\nDISPUTE:\n{dispute}\nEVIDENCE:\n{material}'''
            return parse_model_output(gl.nondet.exec_prompt(prompt, response_format="json"))
        def validate(leader_result):
            if not isinstance(leader_result, gl.vm.Return) or not isinstance(leader_result.calldata, dict): return False
            try:
                p = leader_result.calldata; i = evaluate()
                if not isinstance(i, dict): return False
                d, di = str(p.get("decision", "")), str(i.get("decision", ""))
                ps, ins = int(p.get("fulfillment_score", -1)), int(i.get("fulfillment_score", -1))
                pp, ip = int(p.get("recommended_payment_percentage", -1)), int(i.get("recommended_payment_percentage", -1))
                pv, iv = int(p.get("valid_deliverables", -1)), int(i.get("valid_deliverables", -1))
                pi, ii = int(p.get("invalid_deliverables", -1)), int(i.get("invalid_deliverables", -1))
                return d in ALLOWED_DECISIONS and di in ALLOWED_DECISIONS and d == di and all(0 <= x <= 100 for x in (ps, ins, pp, ip)) and all(0 <= x <= MAX_DELIVERABLE_COUNT for x in (pv, iv, pi, ii)) and abs(ps-ins) <= 10 and abs(pp-ip) <= 10 and abs(pv-iv) <= 1 and abs(pi-ii) <= 1
            except Exception: return False
        result = gl.vm.run_nondet_unsafe(evaluate, validate)
        if not isinstance(result, dict): raise gl.UserError("invalid adjudication result")
        try: decision, score, valid, invalid, payment, confidence = str(result["decision"]), int(result["fulfillment_score"]), int(result["valid_deliverables"]), int(result["invalid_deliverables"]), int(result["recommended_payment_percentage"]), int(result["confidence"])
        except Exception: raise gl.UserError("adjudication returned malformed structured data")
        if decision not in ALLOWED_DECISIONS or not 0 <= score <= 100 or not 0 <= payment <= 100 or not 0 <= confidence <= 100 or not 0 <= valid <= MAX_DELIVERABLE_COUNT or not 0 <= invalid <= MAX_DELIVERABLE_COUNT: raise gl.UserError("invalid adjudication result values")
        if decision == "FULL_FULFILLMENT": payment = 100
        elif decision == "NON_FULFILLMENT": payment = 0
        self.decision, self.fulfillment_score, self.valid_deliverables, self.invalid_deliverables = decision, u256(score), u256(valid), u256(invalid)
        self.recommended_payment_percentage, self.confidence = u256(payment), u256(confidence)
        self.reasoning = str(result.get("reasoning", "")); result["recommended_payment_percentage"] = payment; self.verdict = json.dumps(result, sort_keys=True)
        gl.get_contract_at(self.escrow).emit(on="finalized").apply_verdict(self.case_id, gl.message.contract_address, self.decision, u256(payment))
        self.bridge_emitted = True
        return self.verdict

    @gl.public.write
    def mark_settled(self) -> bool:
        if gl.message.sender_address != self.escrow: raise gl.UserError("only the configured escrow can mark the case settled")
        if self.decision == "PENDING" or not self.bridge_emitted: raise gl.UserError("case has not reached the settlement bridge")
        self.settled = True
        return True
