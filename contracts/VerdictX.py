# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import typing

class VerdictX(gl.Contract):
    case_id: str
    verdict: str
    fulfillment_score: str
    reasoning: str

    def __init__(self, case_id: str):
        self.case_id = case_id
        self.verdict = "PENDING"
        self.fulfillment_score = "0"
        self.reasoning = ""

    @gl.public.view
    def get_verdict(self) -> str:
        return self.verdict

    @gl.public.view
    def get_case(self) -> str:
        return self.case_id

    @gl.public.write
    def adjudicate(self, agreement: str, delivery: str, dispute: str) -> typing.Any:
        def evaluate() -> str:
            prompt = f"""You are an impartial decentralized court. Evaluate this disputed agent agreement.
Agreement: {agreement}
Delivery: {delivery}
Dispute: {dispute}
Return a concise verdict as JSON with decision, fulfillment_score (0-100), and reasoning."""
            return gl.eq_principle.prompt_non_comparative(prompt)
        result = evaluate()
        self.verdict = result
        return result
