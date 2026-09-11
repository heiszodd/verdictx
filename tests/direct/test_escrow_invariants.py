from genlayer import Address


CASE = "VX-TEST-001"


def deploy_escrow(direct_deploy, direct_alice, direct_bob):
    return direct_deploy("contracts/Escrow.py", CASE, direct_alice, direct_bob)


def configure_and_fund(escrow, direct_vm, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    escrow.set_verdict_contract(direct_bob)
    direct_vm.value = 1000
    escrow.fund()
    direct_vm.value = 0


def test_settlement_is_locked_before_finalized_bridge(direct_vm, direct_deploy, direct_alice, direct_bob):
    escrow = deploy_escrow(direct_deploy, direct_alice, direct_bob)
    configure_and_fund(escrow, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("FINALIZED"):
        escrow.settle()

    assert escrow.is_verdict_finalized() is False
    assert escrow.is_settled() is False


def test_full_fulfillment_pays_exactly_100_percent(direct_vm, direct_deploy, direct_alice, direct_bob):
    escrow = deploy_escrow(direct_deploy, direct_alice, direct_bob)
    configure_and_fund(escrow, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    escrow.apply_verdict(CASE, direct_bob, "FULL_FULFILLMENT", 100)

    direct_vm.sender = direct_alice
    escrow.settle()
    assert escrow.get_payment_percentage() == 100
    assert escrow.get_provider_amount() == 1000
    assert escrow.get_buyer_refund() == 0


def test_non_fulfillment_refunds_exactly_100_percent(direct_vm, direct_deploy, direct_alice, direct_bob):
    escrow = deploy_escrow(direct_deploy, direct_alice, direct_bob)
    configure_and_fund(escrow, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    escrow.apply_verdict(CASE, direct_bob, "NON_FULFILLMENT", 0)

    direct_vm.sender = direct_alice
    escrow.settle()
    assert escrow.get_payment_percentage() == 0
    assert escrow.get_provider_amount() == 0
    assert escrow.get_buyer_refund() == 1000


def test_partial_fulfillment_uses_exact_percentage(direct_vm, direct_deploy, direct_alice, direct_bob):
    escrow = deploy_escrow(direct_deploy, direct_alice, direct_bob)
    configure_and_fund(escrow, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    escrow.apply_verdict(CASE, direct_bob, "PARTIAL_FULFILLMENT", 37)

    direct_vm.sender = direct_alice
    escrow.settle()
    assert escrow.get_payment_percentage() == 37
    assert escrow.get_provider_amount() == 370
    assert escrow.get_buyer_refund() == 630


def test_full_and_non_fulfillment_cannot_lie_about_percentage(direct_vm, direct_deploy, direct_alice, direct_bob):
    escrow = deploy_escrow(direct_deploy, direct_alice, direct_bob)
    configure_and_fund(escrow, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("100 percent"):
        escrow.apply_verdict(CASE, direct_bob, "FULL_FULFILLMENT", 99)
    with direct_vm.expect_revert("100 percent"):
        escrow.apply_verdict(CASE, direct_bob, "NON_FULFILLMENT", 1)


def test_invalid_case_blocks_settlement(direct_vm, direct_deploy, direct_alice, direct_bob):
    escrow = deploy_escrow(direct_deploy, direct_alice, direct_bob)
    configure_and_fund(escrow, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    escrow.apply_verdict(CASE, direct_bob, "INVALID_CASE", 0)
    assert escrow.is_verdict_finalized() is True
    assert escrow.is_settlement_blocked() is True

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("INCONCLUSIVE"):
        escrow.settle()


def test_inconclusive_case_blocks_settlement(direct_vm, direct_deploy, direct_alice, direct_bob):
    escrow = deploy_escrow(direct_deploy, direct_alice, direct_bob)
    configure_and_fund(escrow, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    escrow.apply_verdict(CASE, direct_bob, "INCONCLUSIVE", 0)
    assert escrow.is_verdict_finalized() is True
    assert escrow.is_settlement_blocked() is True

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("INCONCLUSIVE"):
        escrow.settle()


def test_case_id_and_sender_are_bound_to_verdict_contract(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    escrow = deploy_escrow(direct_deploy, direct_alice, direct_bob)
    configure_and_fund(escrow, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("unauthorized"):
        escrow.apply_verdict(CASE, direct_charlie, "FULL_FULFILLMENT", 100)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("case ID mismatch"):
        escrow.apply_verdict("VX-WRONG", direct_bob, "FULL_FULFILLMENT", 100)
