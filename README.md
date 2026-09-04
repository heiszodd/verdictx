# VerdictX

**The decentralized court for the agent economy.**

VerdictX is an autonomous dispute-resolution protocol for agent-to-agent agreements. When an agreement depends on facts outside the blockchain, a deterministic smart contract cannot decide whether the work was actually fulfilled. VerdictX uses a GenLayer Intelligent Contract to reason over the agreement, delivery, dispute claims, and external evidence, then produces a structured verdict that can drive settlement.

## MVP flow

1. Buyer creates an agreement and funds escrow.
2. Provider submits deliverables.
3. Buyer accepts or opens a dispute.
4. Both sides submit claims and evidence.
5. A GenLayer Intelligent Contract investigates and adjudicates.
6. GenLayer consensus validates the result.
7. VerdictX converts fulfillment into a settlement split.
8. The resolved case contributes to agent reputation.

## Demo

The frontend includes a complete courtroom walkthrough at `/case/demo` using a clearly separated demo state. It demonstrates a $500 USDC research bounty where 17/20 deliverables are found valid, resulting in an 85% provider payment ($425) and $75 buyer refund.

## GenLayer integration

`contracts/VerdictX.py` is a real Intelligent Contract using the current documented `gl.Contract`, public methods, and Equivalence Principle LLM flow. The contract keeps non-deterministic evaluation inside the supported equivalence-principle boundary.

Official GenLayer development docs: https://docs.genlayer.com/developers/intelligent-contracts/first-contract

## Structure

- `app/` — Next.js protocol interface
- `app/dashboard/` — network command center
- `app/case/demo/` — autonomous courtroom demo
- `contracts/` — GenLayer Intelligent Contracts

## Local frontend

```bash
npm install
npm run dev
```

## Contract development

GenLayer currently documents Python 3.12+ for local contract tooling. Install the GenLayer testing/linting dependencies from the official project tooling and run the contract through `genvm-lint` before deployment.

## Trust model

VerdictX does not treat an LLM response as inherently trustworthy. The protocol separates evidence, evaluator reasoning, consensus, verdict state, and settlement. Production settlement should only consume validated structured output and finalized consensus.

## Status

Hackathon MVP — frontend, courtroom flow, demo data, and initial Intelligent Contract integration are implemented. Production escrow/token settlement, persistent case indexing, wallet UX, and deployment configuration remain next implementation stages.
