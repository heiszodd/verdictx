# {
#   "Seq": [
#     { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
#   ]
# }
from genlayer import *
import json


class VerdictX(gl.Contract):
    case_id: str
    adjudicator: Address
    decision: str
    fulfillment_score: u256
    valid_deliverables: u256
    invalid_deliverables: u256
    recommended_payment_percentage: u256
    confidence: u256
    reasoning: str
    verdict: str
    settled: bool

    def __init__(self, case_id: str):
        self.case_id = case_id
        self.adjudicator = gl.message.sender_address
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
    def get_case(self) -> str:
        return self.case_id

    @gl.public.view
    def get_verdict(self) -> str:
        return self.verdict

    @gl.public.view
    def get_decision(self) -> str:
        return self.decision

    @gl.public.view
    def get_score(self) -> u256:
        return self.fulfillment_score

    @gl.public.view
    def get_payment_percentage(self) -> u256:
        return self.recommended_payment_percentage

    @gl.public.view
    def get_confidence(self) -> u256:
        return self.confidence

    @gl.public.view
    def is_settled(self) -> bool:
        return self.settled

    @gl.public.write
    def adjudicate(self, agreement: str, delivery: str, dispute: str, evidence_urls: list[str]) -> str:
        if self.decision != "PENDING":
            raise gl.UserError("Case has already been adjudicated")

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

Score fulfillment and recommended payment from 0 to 100.
Confidence is an integer from 0 to 100.
valid_deliverables and invalid_deliverables must be non-negative integers.
The recommended payment percentage should reflect the actual degree of fulfillment, not the requested amount.

AGREEMENT:
{agreement}

DELIVERY:
{delivery}

DISPUTE:
{dispute}

EXTERNAL EVIDENCE:
{source_material}

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
            if not isinstance(leader_result, gl.vm.Return):
                return False

            proposed = leader_result.calldata
            if not isinstance(proposed, dict):
                return False

            try:
                independent = evaluate()
                if not isinstance(independent, dict):
                    return False

                allowed = {
                    "FULL_FULFILLMENT",
                    "PARTIAL_FULFILLMENT",
                    "NON_FULFILLMENT",
                    "INVALID_CASE",
                    "INCONCLUSIVE",
                }
                decision = str(proposed.get("decision", ""))
                independent_decision = str(independent.get("decision", ""))
                if decision not in allowed or independent_decision not in allowed:
                    return False

                proposed_score = int(proposed.get("fulfillment_score", -1))
                independent_score = int(independent.get("fulfillment_score", -1))
                proposed_payment = int(proposed.get("recommended_payment_percentage", -1))
                independent_payment = int(independent.get("recommended_payment_percentage", -1))
                proposed_confidence = int(proposed.get("confidence", -1))
                proposed_valid = int(proposed.get("valid_deliverables", -1))
                proposed_invalid = int(proposed.get("invalid_deliverables", -1))

                if not 0 <= proposed_score <= 100 or not 0 <= independent_score <= 100:
                    return False
                if not 0 <= proposed_payment <= 100 or not 0 <= independent_payment <= 100:
                    return False
                if not 0 <= proposed_confidence <= 100:
                    return False
                if proposed_valid < 0 or proposed_invalid < 0:
                    return False

                return (
                    decision == independent_decision
                    and abs(proposed_score - independent_score) <= 10
                    and abs(proposed_payment - independent_payment) <= 10
                    and proposed_valid == int(independent.get("valid_deliverables", -1))
                    and proposed_invalid == int(independent.get("invalid_deliverables", -1))
                )
            except Exception:
                return False

        result = gl.vm.run_nondet_unsafe(evaluate, validate)
        if not isinstance(result, dict):
            raise gl.UserError("Invalid adjudication result")

        try:
            decision = str(result["decision"])
            score = int(result["fulfillment_score"])
            valid = int(result["valid_deliverables"])
            invalid = int(result["invalid_deliverables"])
            payment = int(result["recommended_payment_percentage"])
            confidence = int(result["confidence"])
        except Exception:
            raise gl.UserError("Adjudication returned malformed structured data")

        if decision not in {
            "FULL_FULFILLMENT",
            "PARTIAL_FULFILLMENT",
            "NON_FULFILLMENT",
            "INVALID_CASE",
            "INCONCLUSIVE",
        }:
            raise gl.UserError("Invalid adjudication decision")
        if not 0 <= score <= 100:
            raise gl.UserError("Invalid fulfillment score")
        if valid < 0 or invalid < 0:
            raise gl.UserError("Invalid deliverable counts")
        if not 0 <= payment <= 100:
            raise gl.UserError("Invalid payment percentage")
        if not 0 <= confidence <= 100:
            raise gl.UserError("Invalid confidence")

        self.decision = decision
        self.fulfillment_score = u256(score)
        self.valid_deliverables = u256(valid)
        self.invalid_deliverables = u256(invalid)
        self.recommended_payment_percentage = u256(payment)
        self.confidence = u256(confidence)
        self.reasoning = str(result.get("reasoning", ""))
        self.verdict = json.dumps(result, sort_keys=True)
        return self.verdict

    @gl.public.write
    def mark_settled(self):
        if gl.message.sender_address != self.adjudicator:
            raise gl.UserError("Only the case adjudicator can mark settlement")
        if self.decision == "PENDING":
            raise gl.UserError("Cannot settle an unresolved case")
        if self.settled:
            raise gl.UserError("Case is already marked settled")
        self.settled = True
