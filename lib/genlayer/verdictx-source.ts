export const VERDICTX_CONTRACT_SOURCE = `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json

MAX_EVIDENCE_URLS = 3
MAX_TEXT_LENGTH = 12000
MAX_URL_LENGTH = 2048

@gl.evm.contract_interface
class Recipient:
    class View: pass
    class Write: pass

class VerdictX(gl.Contract):
    case_id: str
    buyer: Address
    provider: Address
    adjudicator: Address
    amount: u256
    funded: bool
    decision: str
    fulfillment_score: u256
    valid_deliverables: u256
    invalid_deliverables: u256
    recommended_payment_percentage: u256
    confidence: u256
    reasoning: str
    verdict: str
    settled: bool

    def __init__(self, case_id: str, provider: Address):
        self.case_id = case_id
        self.buyer = gl.message.sender_address
        self.provider = provider
        self.adjudicator = gl.message.sender_address
        self.amount = u256(0)
        self.funded = False
        self.decision = "PENDING"
        self.fulfillment_score = u256(0)
        self.valid_deliverables = u256(0)
        self.invalid_deliverables = u256(0)
        self.recommended_payment_percentage = u256(0)
        self.confidence = u256(0)
        self.reasoning = ""
        self.verdict = "PENDING"
        self.settled = False

    @gl.public.view
    def get_case(self) -> str: return self.case_id
    @gl.public.view
    def get_buyer(self) -> Address: return self.buyer
    @gl.public.view
    def get_provider(self) -> Address: return self.provider
    @gl.public.view
    def get_amount(self) -> u256: return self.amount
    @gl.public.view
    def is_funded(self) -> bool: return self.funded
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
    def is_settled(self) -> bool: return self.settled

    @gl.public.write.payable
    def fund(self):
        if gl.message.sender_address != self.buyer: raise gl.UserError("only the buyer can fund escrow")
        if self.funded: raise gl.UserError("escrow already funded")
        if gl.message.value == u256(0): raise gl.UserError("escrow amount must be greater than zero")
        self.amount = gl.message.value
        self.funded = True

    @gl.public.write
    def adjudicate(self, agreement: str, delivery: str, dispute: str, evidence_urls: list[str]) -> str:
        if self.decision != "PENDING": raise gl.UserError("Case has already been adjudicated")
        if not agreement.strip() or not delivery.strip() or not dispute.strip(): raise gl.UserError("Agreement, delivery, and dispute are required")
        if len(agreement) > MAX_TEXT_LENGTH or len(delivery) > MAX_TEXT_LENGTH or len(dispute) > MAX_TEXT_LENGTH: raise gl.UserError("Case text exceeds the maximum supported length")
        if len(evidence_urls) > MAX_EVIDENCE_URLS: raise gl.UserError("A maximum of three evidence URLs is supported")
        for url in evidence_urls:
            if not isinstance(url, str) or not url.strip() or len(url) > MAX_URL_LENGTH: raise gl.UserError("Evidence URLs must be non-empty and shorter than 2048 characters")

        def evaluate() -> dict:
            source_material = ""
            for url in evidence_urls:
                try:
                    page = gl.nondet.web.render(url, mode="text")
                    source_material += f"\nSOURCE {url}\n{page[:12000]}"
                except Exception:
                    source_material += f"\nSOURCE {url}\nUNAVAILABLE"
            prompt = f"""You are the impartial adjudicator for VerdictX, a decentralized court for autonomous-agent agreements.
Evaluate the dispute using the agreement, delivery, dispute statement, and independently retrieved evidence.
Do not assume either party is truthful. Do not invent unavailable facts.
Score fulfillment and recommended payment from 0 to 100. Confidence is an integer from 0 to 100.
valid_deliverables and invalid_deliverables must be non-negative integers.

AGREEMENT:\n{agreement}\n
DELIVERY:\n{delivery}\n
DISPUTE:\n{dispute}\n
EXTERNAL EVIDENCE:\n{source_material}\n
Return ONLY this JSON object:
{{
  "decision": "FULL_FULFILLMENT|PARTIAL_FULFILLMENT|NON_FULFILLMENT|INVALID_CASE|INCONCLUSIVE",
  "fulfillment_score": 0,
  "valid_deliverables": 0,
  "invalid_deliverables": 0,
  "recommended_payment_percentage": 0,
  "confidence": 0,
  "findings": ["..."],
  "reasoning": "..."
}}"""
            return gl.nondet.exec_prompt(prompt, response_format="json")

        def validate(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return): return False
            proposed = leader_result.calldata
            if not isinstance(proposed, dict): return False
            try:
                independent = evaluate()
                if not isinstance(independent, dict): return False
                allowed = {"FULL_FULFILLMENT", "PARTIAL_FULFILLMENT", "NON_FULFILLMENT", "INVALID_CASE", "INCONCLUSIVE"}
                decision = str(proposed.get("decision", "")); independent_decision = str(independent.get("decision", ""))
                if decision not in allowed or independent_decision not in allowed: return False
                ps = int(proposed.get("fulfillment_score", -1)); ins = int(independent.get("fulfillment_score", -1))
                pp = int(proposed.get("recommended_payment_percentage", -1)); inp = int(independent.get("recommended_payment_percentage", -1))
                pv = int(proposed.get("valid_deliverables", -1)); pi = int(proposed.get("invalid_deliverables", -1))
                iv = int(independent.get("valid_deliverables", -1)); ii = int(independent.get("invalid_deliverables", -1))
                return 0 <= ps <= 100 and 0 <= ins <= 100 and 0 <= pp <= 100 and 0 <= inp <= 100 and pv >= 0 and pi >= 0 and iv >= 0 and ii >= 0 and decision == independent_decision and abs(ps - ins) <= 10 and abs(pp - inp) <= 10 and pv == iv and pi == ii
            except Exception: return False

        result = gl.vm.run_nondet_unsafe(evaluate, validate)
        if not isinstance(result, dict): raise gl.UserError("Invalid adjudication result")
        try:
            decision = str(result["decision"]); score = int(result["fulfillment_score"]); valid = int(result["valid_deliverables"]); invalid = int(result["invalid_deliverables"]); payment = int(result["recommended_payment_percentage"]); confidence = int(result["confidence"])
        except Exception: raise gl.UserError("Adjudication returned malformed structured data")
        if decision not in {"FULL_FULFILLMENT", "PARTIAL_FULFILLMENT", "NON_FULFILLMENT", "INVALID_CASE", "INCONCLUSIVE"}: raise gl.UserError("Invalid adjudication decision")
        if not 0 <= score <= 100 or not 0 <= payment <= 100 or not 0 <= confidence <= 100 or valid < 0 or invalid < 0: raise gl.UserError("Invalid adjudication result values")
        self.decision = decision; self.fulfillment_score = u256(score); self.valid_deliverables = u256(valid); self.invalid_deliverables = u256(invalid); self.recommended_payment_percentage = u256(payment); self.confidence = u256(confidence); self.reasoning = str(result.get("reasoning", "")); self.verdict = json.dumps(result, sort_keys=True)
        return self.verdict

    @gl.public.write
    def settle(self):
        if gl.message.sender_address != self.buyer: raise gl.UserError("only the buyer can settle")
        if not self.funded or self.settled or self.decision == "PENDING": raise gl.UserError("case is not settleable")
        provider_amount = (self.amount * self.recommended_payment_percentage) // u256(100)
        refund = self.amount - provider_amount
        self.settled = True
        if provider_amount > u256(0): Recipient(self.provider).emit_transfer(value=provider_amount, on='finalized')
        if refund > u256(0): Recipient(self.buyer).emit_transfer(value=refund, on='finalized')
`;
