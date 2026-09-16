from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded


def test_escrow_receiver_rejects_wrong_case_and_enforces_split(accounts):
    buyer = accounts[0]
    provider = accounts[1]
    verdict = accounts[2]

    factory = get_contract_factory("Escrow")
    escrow = factory.deploy(args=["VX-INTEGRATION", buyer.address, provider.address], account=buyer)

    configure = escrow.set_verdict_contract(args=[verdict.address], account=buyer).transact()
    assert tx_execution_succeeded(configure)
    funding = escrow.fund(account=buyer, value=1_000_000_000_000_000_000).transact()
    assert tx_execution_succeeded(funding)

    bad = escrow.apply_verdict(args=["WRONG", verdict.address, "FULL_FULFILLMENT", 100], account=verdict).transact()
    assert not tx_execution_succeeded(bad)

    good = escrow.apply_verdict(args=["VX-INTEGRATION", verdict.address, "PARTIAL_FULFILLMENT", 37], account=verdict).transact()
    assert tx_execution_succeeded(good)
    assert escrow.is_verdict_finalized().call() is True
    assert escrow.get_payment_percentage().call() == 37
