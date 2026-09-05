# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *


@gl.evm.contract_interface
class Recipient:
    class View:
        pass

    class Write:
        pass


class Escrow(gl.Contract):
    buyer: Address
    provider: Address
    arbiter: Address
    amount: u256
    funded: bool
    released: bool
    settlement_set: bool
    recommended_payment_percentage: u256
    provider_amount: u256
    buyer_refund: u256

    def __init__(self, buyer: Address, provider: Address, arbiter: Address):
        self.buyer = buyer
        self.provider = provider
        self.arbiter = arbiter
        self.amount = u256(0)
        self.funded = False
        self.released = False
        self.settlement_set = False
        self.recommended_payment_percentage = u256(0)
        self.provider_amount = u256(0)
        self.buyer_refund = u256(0)

    @gl.public.write.payable
    def fund(self):
        if self.funded:
            raise gl.UserError("escrow already funded")
        self.amount = gl.message.value
        if self.amount == u256(0):
            raise gl.UserError("escrow amount must be greater than zero")
        self.funded = True

    @gl.public.write
    def set_settlement_percentage(self, provider_percentage: u256):
        if gl.message.sender_address != self.arbiter:
            raise gl.UserError("only the arbiter can set settlement")
        if self.released or self.settlement_set:
            raise gl.UserError("settlement is already finalized")
        if provider_percentage > u256(100):
            raise gl.UserError("percentage must be between 0 and 100")

        self.recommended_payment_percentage = provider_percentage
        self.settlement_set = True

    @gl.public.write
    def settle(self):
        if not self.funded or self.released:
            raise gl.UserError("escrow is not settleable")
        if not self.settlement_set:
            raise gl.UserError("arbiter has not set settlement")
        if gl.message.sender_address != self.buyer:
            raise gl.UserError("only the buyer can execute the settlement")

        self.provider_amount = (
            self.amount * self.recommended_payment_percentage
        ) // u256(100)
        self.buyer_refund = self.amount - self.provider_amount
        self.released = True

        if self.provider_amount > u256(0):
            Recipient(self.provider).emit_transfer(value=self.provider_amount)
        if self.buyer_refund > u256(0):
            Recipient(self.buyer).emit_transfer(value=self.buyer_refund)

    @gl.public.view
    def get_state(self) -> str:
        return (
            f"funded={self.funded};released={self.released};"
            f"settlement_set={self.settlement_set};"
            f"percentage={self.recommended_payment_percentage};"
            f"provider={self.provider_amount};refund={self.buyer_refund}"
        )
