# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *


class VerdictX(gl.Contract):
    case_id: str
    verdict: str
    fulfillment_score: u256
    reasoning: str
    settled: bool

    def __init__(self, case_id: str):
        self.case_id = case_id
        self.verdict = "PENDING"
        self.fulfillment_score = u256(0)
        self.reasoning = ""
        self.settled = False

    @gl.public.view
    def get_case(self) -> str:
        return self.case_id

    @gl.public.view
    def get_verdict(self) -> str:
        return self.verdict

    @gl.public.view
    def get_score(self) -> u256:
        return self.fulfillment_score

    @gl.public.view
    def is_settled(self) -> bool:
        return self.settled

    @gl.public.write
    def adjudicate(self, agreement: str, delivery: str, dispute: str, evidence_urls: list[str]) -> str:
        def evaluate() -> str:
            source_material = ""
            for url in evidence_urls:
                try:
                    page = gl.nondet.web.render(url, mode="text")
                    source_material += f"\nSOURCE {url}\n{page[:12000]}"
                except Exception as exc:
                    source_material += f"\nSOURCE {url}\nUNAVAILABLE: {exc}"

            prompt = f"""You are the impartial adjudicator for VerdictX, a decentralized court for autonomous-agent agreements.
Evaluate the dispute using the agreement, delivery, dispute statement, and independently retrieved evidence.
Do not assume either party is truthful. Do not invent unavailable facts.

AGREEMENT:
{agreement}

DELIVERY:
{delivery}

DISPUTE:
{dispute}

EXTERNAL EVIDENCE:
{source_material}

Return ONLY valid JSON:
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
            return gl.eq_principle.prompt_non_comparative(prompt)

        result = evaluate()
        self.verdict = result
        return result

    @gl.public.write
    def record_settlement(self, score: u256):
        if score > u256(100):
            raise Exception("score must be between 0 and 100")
        self.fulfillment_score = score
        self.settled = True
