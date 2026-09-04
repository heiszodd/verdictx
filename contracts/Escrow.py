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
    amount: u256
    funded: bool
    released: bool
    provider_amount: u256
    buyer_refund: u256

    def __init__(self, buyer: Address, provider: Address):
        self.buyer = buyer
        self.provider = provider
        self.amount = u256(0)
        self.funded = False
        self.released = False
        self.provider_amount = u256(0)
        self.buyer_refund = u256(0)

    @gl.public.write.payable
    def fund(self):
        if self.funded:
            raise Exception("escrow already funded")
        self.amount = gl.message.value
        if self.amount == u256(0):
            raise Exception("escrow amount must be greater than zero")
        self.funded = True

    @gl.public.write
    def settle(self, provider_percentage: u256):
        if not self.funded or self.released:
            raise Exception("escrow is not settleable")
        if gl.message.sender_address != self.buyer:
            raise Exception("only the buyer can submit the final settlement")
        if provider_percentage > u256(100):
            raise Exception("percentage must be between 0 and 100")

        self.provider_amount = (self.amount * provider_percentage) // u256(100)
        self.buyer_refund = self.amount - self.provider_amount
        self.released = True

        if self.provider_amount > u256(0):
            Recipient(self.provider).emit_transfer(value=self.provider_amount)
        if self.buyer_refund > u256(0):
            Recipient(self.buyer).emit_transfer(value=self.buyer_refund)

    @gl.public.view
    def get_state(self) -> str:
        return f"funded={self.funded};released={self.released};provider={self.provider_amount};refund={self.buyer_refund}"
