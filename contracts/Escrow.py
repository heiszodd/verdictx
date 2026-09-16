# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *


ZERO_ADDRESS = Address("0x0000000000000000000000000000000000000000")
ALLOWED_DECISIONS = {
    "FULL_FULFILLMENT",
    "PARTIAL_FULFILLMENT",
    "NON_FULFILLMENT",
    "INVALID_CASE",
    "INCONCLUSIVE",
}


@gl.evm.contract_interface
class Recipient:
    class View:
        pass

    class Write:
        pass


class Escrow(gl.Contract):
    case_id: str
    buyer: Address
    provider: Address
    arbiter: Address
    verdict_contract: Address
    amount: u256
    funded: bool
    verdict_finalized: bool
    settlement_blocked: bool
    settlement_set: bool
    released: bool
    verdict_decision: str
    recommended_payment_percentage: u256
    provider_amount: u256
    buyer_refund: u256

    def __init__(self, case_id: str, buyer: Address, provider: Address):
        self.case_id = case_id
        self.buyer = buyer
        self.provider = provider
        self.arbiter = buyer
        self.verdict_contract = ZERO_ADDRESS
        self.amount = u256(0)
        self.funded = False
        self.verdict_finalized = False
        self.settlement_blocked = False
        self.settlement_set = False
        self.released = False
        self.verdict_decision = "PENDING"
        self.recommended_payment_percentage = u256(0)
        self.provider_amount = u256(0)
        self.buyer_refund = u256(0)

    @gl.public.view
    def get_case(self) -> str:
        return self.case_id

    @gl.public.view
    def get_buyer(self) -> Address:
        return self.buyer

    @gl.public.view
    def get_provider(self) -> Address:
        return self.provider

    @gl.public.view
    def get_verdict_contract(self) -> Address:
        return self.verdict_contract

    @gl.public.view
    def get_amount(self) -> u256:
        return self.amount

    @gl.public.view
    def is_funded(self) -> bool:
        return self.funded

    @gl.public.view
    def is_verdict_finalized(self) -> bool:
        return self.verdict_finalized

    @gl.public.view
    def is_settlement_blocked(self) -> bool:
        return self.settlement_blocked

    @gl.public.view
    def is_settled(self) -> bool:
        return self.released

    @gl.public.view
    def get_decision(self) -> str:
        return self.verdict_decision

    @gl.public.view
    def get_payment_percentage(self) -> u256:
        return self.recommended_payment_percentage

    @gl.public.view
    def get_provider_amount(self) -> u256:
        return self.provider_amount

    @gl.public.view
    def get_buyer_refund(self) -> u256:
        return self.buyer_refund

    @gl.public.write
    def set_verdict_contract(self, verdict_contract: Address):
        if gl.message.sender_address != self.buyer:
            raise gl.UserError("only the buyer can configure the verdict contract")
        if self.funded or self.verdict_finalized or self.verdict_contract != ZERO_ADDRESS:
            raise gl.UserError("verdict contract is already locked")
        if verdict_contract == ZERO_ADDRESS:
            raise gl.UserError("verdict contract cannot be the zero address")
        self.verdict_contract = verdict_contract

    @gl.public.write.payable
    def fund(self):
        if gl.message.sender_address != self.buyer:
            raise gl.UserError("only the buyer can fund escrow")
        if self.verdict_contract == ZERO_ADDRESS:
            raise gl.UserError("verdict contract must be configured before funding")
        if self.funded:
            raise gl.UserError("escrow already funded")
        if gl.message.value == u256(0):
            raise gl.UserError("escrow amount must be greater than zero")
        self.amount = gl.message.value
        self.funded = True

    @gl.public.write
    def apply_verdict(
        self,
        case_id: str,
        verdict_contract: Address,
        decision: str,
        provider_percentage: u256,
    ):
        # This method is intentionally callable only by the configured VerdictX
        # contract. VerdictX emits this message with on='finalized', so reaching
        # this method is the settlement authorization proof for the adjudication.
        if gl.message.sender_address != self.verdict_contract:
            raise gl.UserError("unauthorized verdict contract")
        if case_id != self.case_id:
            raise gl.UserError("case ID mismatch")
        if verdict_contract != self.verdict_contract:
            raise gl.UserError("verdict contract identity mismatch")
        if not self.funded:
            raise gl.UserError("escrow must be funded before applying a verdict")
        if self.verdict_finalized or self.released:
            raise gl.UserError("verdict has already been applied")
        if decision not in ALLOWED_DECISIONS:
            raise gl.UserError("invalid verdict decision")
        if provider_percentage > u256(100):
            raise gl.UserError("percentage must be between 0 and 100")

        if decision == "FULL_FULFILLMENT" and provider_percentage != u256(100):
            raise gl.UserError("full fulfillment must pay the provider 100 percent")
        if decision == "NON_FULFILLMENT" and provider_percentage != u256(0):
            raise gl.UserError("non-fulfillment must refund the buyer 100 percent")

        self.verdict_decision = decision
        self.recommended_payment_percentage = provider_percentage
        self.verdict_finalized = True
        self.settlement_set = decision in {"FULL_FULFILLMENT", "PARTIAL_FULFILLMENT", "NON_FULFILLMENT"}
        self.settlement_blocked = decision in {"INVALID_CASE", "INCONCLUSIVE"}

    @gl.public.write
    def settle(self):
        if gl.message.sender_address != self.buyer:
            raise gl.UserError("only the buyer can execute settlement")
        if not self.funded or self.released:
            raise gl.UserError("escrow is not settleable")
        if not self.verdict_finalized:
            raise gl.UserError("settlement is locked until the verdict is FINALIZED")
        if self.settlement_blocked:
            raise gl.UserError("invalid or inconclusive verdict cannot release escrow")
        if not self.settlement_set:
            raise gl.UserError("no valid settlement decision is recorded")
        if self.recommended_payment_percentage > u256(100):
            raise gl.UserError("invalid settlement percentage")

        self.provider_amount = (
            self.amount * self.recommended_payment_percentage
        ) // u256(100)
        self.buyer_refund = self.amount - self.provider_amount
        if self.provider_amount + self.buyer_refund != self.amount:
            raise gl.UserError("settlement split invariant failed")
        self.released = True

        if self.provider_amount > u256(0):
            Recipient(self.provider).emit_transfer(value=self.provider_amount)
        if self.buyer_refund > u256(0):
            Recipient(self.buyer).emit_transfer(value=self.buyer_refund)

    @gl.public.view
    def get_state(self) -> str:
        return (
            f"case={self.case_id};funded={self.funded};"
            f"verdict_finalized={self.verdict_finalized};blocked={self.settlement_blocked};"
            f"released={self.released};decision={self.verdict_decision};"
            f"percentage={self.recommended_payment_percentage};"
            f"provider={self.provider_amount};refund={self.buyer_refund}"
        )
