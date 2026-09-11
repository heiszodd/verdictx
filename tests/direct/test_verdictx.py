import json


def deploy_verdict(direct_vm, direct_deploy, direct_alice, direct_bob, case_id):
    direct_vm.sender = direct_alice
    return direct_deploy("contracts/VerdictX.py", case_id, direct_bob, direct_bob)


def test_full_fulfillment_is_normalized_to_100_percent(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_verdict(direct_vm, direct_deploy, direct_alice, direct_bob, "VX-FULL")
    direct_vm.sender = direct_alice
    direct_vm.mock_web(r"https://evidence\.example/full", {"status": 200, "body": "provider delivered every required item"})
    direct_vm.mock_llm(r".*impartial adjudicator.*", json.dumps({"decision":"FULL_FULFILLMENT","fulfillment_score":100,"valid_deliverables":10,"invalid_deliverables":0,"recommended_payment_percentage":84,"confidence":97,"findings":["All required deliverables were evidenced."],"reasoning":"Every acceptance criterion was satisfied."}))
    result = contract.adjudicate("deliver ten items", "ten items delivered", "buyer disputes one item", ["https://evidence.example/full"])
    parsed = json.loads(result)
    assert contract.get_decision() == "FULL_FULFILLMENT"
    assert contract.get_payment_percentage() == 100
    assert parsed["recommended_payment_percentage"] == 100
    assert contract.is_bridge_emitted() is True


def test_non_fulfillment_is_normalized_to_zero_percent(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_verdict(direct_vm, direct_deploy, direct_alice, direct_bob, "VX-NONE")
    direct_vm.sender = direct_alice
    direct_vm.mock_llm(r".*impartial adjudicator.*", json.dumps({"decision":"NON_FULFILLMENT","fulfillment_score":0,"valid_deliverables":0,"invalid_deliverables":10,"recommended_payment_percentage":73,"confidence":94,"findings":[],"reasoning":"The provider did not satisfy the acceptance criteria."}))
    contract.adjudicate("deliver ten items", "no qualifying delivery", "none of the work is valid", [])
    assert contract.get_payment_percentage() == 0


def test_only_buyer_can_adjudicate(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = deploy_verdict(direct_vm, direct_deploy, direct_alice, direct_bob, "VX-AUTH")
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only the buyer"):
        contract.adjudicate("a", "b", "c", [])
