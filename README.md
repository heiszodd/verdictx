# VerdictX

> **The decentralized court for the agent economy.**

VerdictX is a GenLayer-native dispute-resolution protocol for autonomous agent commerce. It turns subjective, real-world deliverable disputes into a structured adjudication that can authorize a deterministic escrow split — without trusting a centralized arbitrator or pretending that ordinary smart contracts can understand arbitrary web evidence.

[![GenLayer](https://img.shields.io/badge/GenLayer-Intelligent%20Contracts-111111)](https://docs.genlayer.com/)
[![Network](https://img.shields.io/badge/network-Bradbury-111111)](https://docs.genlayer.com/developers/networks)
[![Status](https://img.shields.io/badge/status-hackathon%20MVP-111111)](https://github.com/heiszodd/verdictx)

## Live

- **GitHub:** https://github.com/heiszodd/verdictx
- **Demo:** https://view-link.cx/AyzahC2YBHL
- **GenLayer Bradbury Explorer:** https://explorer-bradbury.genlayer.com
- **GenLayer RPC:** https://rpc-bradbury.genlayer.com

### Deployed contract addresses

The repository deliberately does **not** invent deployment addresses. The current branch deploys a new, paired `VerdictX` + `Escrow` instance per agreement. Run the Bradbury smoke deployment below; it prints the exact finalized contract addresses and transaction hashes. Put those addresses into `.env.local` before describing a deployment as live.

| Contract | Role | Address |
|---|---|---|
| VerdictX | AI/web adjudication | emitted by `npm run deploy:smoke` |
| Escrow | finalized settlement authority | emitted by `npm run deploy:smoke` |

This is intentional truth-in-advertising: an address is only listed as deployed after the deployment transaction itself has finalized successfully.

---

## 1. The problem

Autonomous agents are moving from conversations to economic actions: research, coding, design, data collection, monitoring, execution and other services can be bought and delivered without a human sitting in the loop.

The missing primitive is **subjective fulfillment**.

A conventional escrow can answer:

> "Did the required transaction happen?"

It cannot natively answer:

> "Did this research agent actually deliver the agreed work, according to these acceptance criteria, and what percentage of the payment should the provider receive after examining public evidence?"

That gap becomes a trust bottleneck. The buyer can dispute indefinitely. The provider can claim completion indefinitely. A centralized platform can arbitrate, but then the platform becomes the court.

VerdictX makes the court a protocol.

---

## 2. The solution

VerdictX separates the problem into two trust domains:

1. **VerdictX Intelligent Contract** — performs non-deterministic investigation using GenLayer web rendering and LLM execution, then reaches a consensus-validated structured decision.
2. **Escrow Intelligent Contract** — contains the funds and implements deterministic settlement rules. It never trusts a frontend percentage or an arbitrary caller.

The critical bridge is:

```text
VerdictX.adjudicate()
        |
        | consensus
        v
    ACCEPTED
        |
        | appeal window
        v
    FINALIZED
        |
        | on='finalized' internal message
        v
Escrow.apply_verdict()
        |
        | case ID + sender + percentage invariants
        v
Escrow settlement authorization
        |
        | buyer executes
        v
Provider payout + buyer refund
```

`ACCEPTED` is deliberately insufficient. GenLayer documents `Accepted` as provisional because the appeal window is still open. Irreversible accounting waits for the stored `Finalized` state. See the official [GenLayer finality documentation](https://docs.genlayer.com/understand-genlayer-protocol/core-concepts/optimistic-democracy/finality).

The bridge is also not a frontend convention. `VerdictX` emits `Escrow.apply_verdict(...)` with `on="finalized"`. GenLayer creates that child transaction only after the parent adjudication has finalized. The escrow then verifies that the message sender is the configured VerdictX contract and that the case ID and payment percentage match its stored agreement.

---

## 3. Why GenLayer is mandatory here

This is not an ordinary EVM smart-contract problem.

### Web evidence is non-deterministic

Evidence may be a rendered webpage, public research source, documentation, marketplace listing, GitHub artifact, or another real-world URL. Traditional deterministic execution cannot freely fetch and interpret that changing external state.

GenLayer Intelligent Contracts can execute non-deterministic web and LLM operations and use consensus/equivalence mechanisms to turn those observations into a blockchain-verifiable execution result.

### LLM reasoning is non-deterministic

A language model is not a deterministic arithmetic opcode. Two validators can observe the same evidence and produce slightly different natural-language reasoning. VerdictX therefore does not put a raw LLM answer directly into settlement. It:

- constrains the model to a strict structured schema;
- validates decision enums and numerical bounds;
- requires validator agreement on the structured result within explicit tolerances;
- normalizes `FULL_FULFILLMENT` to exactly 100%;
- normalizes `NON_FULFILLMENT` to exactly 0%;
- carries the calculated partial percentage into the escrow bridge;
- blocks `INVALID_CASE` and `INCONCLUSIVE` from releasing funds.

This is precisely the class of workload GenLayer Intelligent Contracts are designed to address.

---

## 4. End-to-end workflow

### 1. Agreement

The buyer creates an agreement containing:

- case ID;
- provider address;
- task description;
- acceptance criteria;
- dispute context;
- evidence sources;
- escrow amount.

The frontend deploys two contracts and permanently binds them together before funding.

### 2. Delivery

The provider performs the task and submits the deliverable.

### 3. Dispute

The buyer supplies the actual delivery, dispute statement and up to three public evidence URLs.

### 4. GenLayer adjudication

`VerdictX.adjudicate()` renders the evidence, asks an LLM to evaluate fulfillment and runs the evaluation through GenLayer's non-deterministic consensus boundary.

### 5. Consensus

The transaction moves through the GenLayer lifecycle. `ACCEPTED` means the committee has accepted a receipt, but it is still appealable. VerdictX exposes no settlement action at this stage.

### 6. Finalization

After the appeal window is resolved, the adjudication becomes `FINALIZED`. The protocol's finalized-message mechanism then creates the bridge transaction to the dedicated escrow.

### 7. Escrow authorization

`Escrow.apply_verdict()` verifies:

- the caller is the exact configured VerdictX contract;
- the supplied case ID equals the escrow case ID;
- the supplied VerdictX identity equals the configured identity;
- the escrow was funded;
- the decision is valid;
- full fulfillment is exactly 100%;
- non-fulfillment is exactly 0%;
- the percentage is within 0–100.

### 8. Settlement

Only the buyer can call `Escrow.settle()`. Settlement additionally requires `verdict_finalized == true` and a non-blocked decision.

The payout invariant is:

```text
provider_amount = escrow_amount × provider_percentage / 100
buyer_refund    = escrow_amount - provider_amount
provider_amount + buyer_refund = escrow_amount
```

---

## 5. Contract architecture

### `contracts/VerdictX.py`

Responsibilities:

- stores buyer/provider/escrow identity;
- accepts the dispute inputs;
- renders external evidence through `gl.nondet.web.render`;
- evaluates the dispute with `gl.nondet.exec_prompt`;
- validates structured consensus output;
- stores the final adjudication data;
- emits the escrow authorization message with `on="finalized"`.

### `contracts/Escrow.py`

Responsibilities:

- stores the buyer/provider/case identity;
- accepts native GEN funding;
- locks its VerdictX contract address before funding;
- accepts verdict authorization only from that address;
- requires the exact case ID;
- refuses settlement before finalized authorization;
- refuses invalid/inconclusive settlement;
- computes the provider payout and buyer refund;
- transfers the resulting amounts.

### Security boundary

There is intentionally **no** `set_settlement_percentage()` admin escape hatch.

The frontend cannot choose a percentage.

The buyer cannot choose a percentage.

A random agent cannot choose a percentage.

The only settlement percentage accepted by escrow is the one emitted by the configured VerdictX contract through the finalized bridge.

---

## 6. Settlement edge cases

| Verdict | Provider | Buyer | Settlement |
|---|---:|---:|---|
| `FULL_FULFILLMENT` | 100% | 0% | allowed after FINALIZED |
| `PARTIAL_FULFILLMENT` | exact model percentage | remainder | allowed after FINALIZED |
| `NON_FULFILLMENT` | 0% | 100% | allowed after FINALIZED |
| `INVALID_CASE` | 0% | funds remain locked | blocked |
| `INCONCLUSIVE` | 0% | funds remain locked | blocked |
| `PENDING` / `PROPOSING` / `ACCEPTED` | — | — | blocked |

An invalid or inconclusive case is not silently converted into a buyer refund. That distinction matters: lack of a defensible adjudication is different from an adjudication that the provider failed.

---

## 7. Truth-in-advertising matrix

| Feature | Status | Source of truth |
|---|---|---|
| VerdictX Intelligent Contract | **LIVE / ON-CHAIN when deployed** | `contracts/VerdictX.py` |
| Real web evidence rendering | **LIVE in adjudication execution** | `gl.nondet.web.render` |
| LLM adjudication | **LIVE in adjudication execution** | `gl.nondet.exec_prompt` |
| GenLayer consensus lifecycle | **LIVE** | GenLayer transaction status |
| FINALIZED settlement gate | **LIVE / enforced by contract** | `Escrow.verdict_finalized` |
| Verdict → escrow bridge | **LIVE / protocol message** | `on='finalized'` |
| Escrow funding | **LIVE** | `Escrow.fund()` |
| Provider/buyer payout | **LIVE when deployed on a supported network** | `Escrow.settle()` |
| Frontend case index | **LOCAL BROWSER STATE** | `localStorage` |
| Demo courtroom walkthrough | **SIMULATION** | `/case/demo` |
| Vercel demo UI | **UI surface; inspect badge before assuming a path is on-chain** | frontend |
| Contract addresses in this README | **Not fabricated** | smoke deployment output |

The application does not silently turn a simulated verdict into a live payout. The settlement path requires an actual finalized GenLayer transaction and a finalized bridge state in the escrow contract.

---

## 8. Repository structure

```text
verdictx/
├── app/
│   ├── agreements/create/       # paired contract deployment UX
│   ├── case/[id]/               # live case + escrow UI
│   └── case/demo/               # explicit simulation walkthrough
├── components/
│   └── AdjudicationControl.tsx  # lifecycle + finality + settlement gate
├── contracts/
│   ├── VerdictX.py              # GenLayer adjudicator
│   └── Escrow.py                 # finalized verdict settlement
├── lib/genlayer/
│   ├── client.ts                # GenLayerJS + escrow bridge utilities
│   ├── escrow-source.ts         # browser-deployable escrow source
│   ├── verdictx-source.ts       # browser-deployable VerdictX source
│   └── parse-verdict.ts         # strict frontend result validation
├── scripts/
│   └── deploy-smoke.ts           # Bradbury deploy → fund → adjudicate → finalize → settle
├── tests/
│   ├── direct/                   # fast deterministic contract tests
│   └── integration/              # Studio/localnet integration tests
├── .env.example
├── gltest.config.yaml
├── requirements.txt
└── README.md
```

---

## 9. Quickstart

### Requirements

- Node.js 20+
- Python 3.12+
- npm
- a GenLayer-compatible EVM wallet for browser interaction
- test GEN for Bradbury when performing live transactions

Install the GenLayer CLI globally:

```bash
npm install -g genlayer
```

Install Python tooling:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Install frontend dependencies:

```bash
npm install
```

Create local configuration:

```bash
cp .env.example .env.local
```

Never put a private key in a `NEXT_PUBLIC_*` variable.

---

## 10. Contract linting

The repository pins `genvm-linter` 0.11.0.

Run the complete contract check:

```bash
npm run contract:lint
```

Or directly:

```bash
genvm-lint check contracts/VerdictX.py
genvm-lint check contracts/Escrow.py
```

Useful additional checks:

```bash
genvm-lint lint contracts/VerdictX.py
genvm-lint validate contracts/VerdictX.py
genvm-lint schema contracts/VerdictX.py --output artifacts/verdictx-schema.json

genvm-lint lint contracts/Escrow.py
genvm-lint validate contracts/Escrow.py
genvm-lint schema contracts/Escrow.py --output artifacts/escrow-schema.json
```

The linter catches GenVM safety/structure problems and validates the pinned SDK dependency before deployment.

---

## 11. Tests

### Direct tests

Fast in-memory tests with mocked web/LLM calls:

```bash
npm run contract:test
```

Equivalent:

```bash
pytest tests/direct/ -v
```

The direct suite covers:

- pre-finality settlement lock;
- full fulfillment → 100%;
- non-fulfillment → 0%;
- exact partial split;
- percentage manipulation attempts;
- invalid/inconclusive settlement blocking;
- case ID mismatch;
- unauthorized verdict sender;
- buyer-only adjudication;
- VerdictX percentage normalization.

### Integration tests

Run against a local GenLayer Studio instance:

```bash
npm run contract:integration
```

Or:

```bash
gltest tests/integration/ -v -s
```

For the full consensus environment, use a configured Studio/testnet account set and the supplied `gltest.config.yaml`.

---

## 12. Bradbury deployment

Select the persistent public testnet:

```bash
genlayer network set testnet-bradbury
genlayer network info
```

Direct CLI deployment is available for individual contracts:

```bash
genlayer deploy --contract contracts/VerdictX.py --args "VX-CLI" 0xPROVIDER 0xESCROW
```

However, VerdictX is a **paired deployment**. The recommended path is the smoke script because the two contracts have to be deployed and bound in the correct order:

```text
Escrow deploy
   ↓
VerdictX deploy with Escrow address
   ↓
Escrow.set_verdict_contract(VerdictX)
   ↓
Fund
   ↓
Adjudicate
   ↓
FINALIZED
   ↓
Finalized bridge child transaction
   ↓
Settle
```

### Bradbury smoke deployment

Populate `.env.local` or your shell environment:

```bash
export GENLAYER_PRIVATE_KEY=0x...
export SMOKE_PROVIDER_ADDRESS=0x...
export SMOKE_FUND_AMOUNT_GEN=1
export SMOKE_EVIDENCE_URLS=https://example.com
```

Run:

```bash
npm run deploy:smoke
```

The script:

1. deploys `Escrow.py`;
2. waits for deployment finality;
3. deploys `VerdictX.py` bound to that escrow;
4. waits for deployment finality;
5. configures the escrow bridge;
6. funds escrow with native GEN;
7. calls `adjudicate()` with the configured evidence URLs;
8. waits for the adjudication transaction to become `FINALIZED`;
9. follows the finalized VerdictX → Escrow child message;
10. verifies the escrow received finalized authorization;
11. executes settlement;
12. waits for settlement finality;
13. verifies provider payout + buyer refund conservation;
14. prints buyer/provider wallet balances and all transaction hashes.

If finalization is lagging, the GenLayer CLI exposes the permissionless finalization operation:

```bash
genlayer finalize <ADJUDICATION_TX_HASH>
```

Then resume the smoke script rather than submitting the adjudication again.

---

## 13. Frontend

Start the Next.js app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

Type-check:

```bash
npm run lint
```

The live UI distinguishes:

- `ON-CHAIN / GENLAYER` — real contract/lifecycle path;
- `DEMO / SIMULATION` — display-only path.

Most importantly, the frontend does not interpret `ACCEPTED` as finality. The settlement action remains disabled until both conditions are true:

```text
adjudication.status === FINALIZED
AND
escrow.is_verdict_finalized() === true
```

The second condition proves that the finalized bridge message has reached the escrow itself.

---

## 14. Environment

`.env.example` contains public RPC, explorer and contract-address configuration plus the variables used by the testnet smoke script.

The actual `.env` file is intentionally not part of the repository. `.gitignore` excludes local environment files.

Public values:

```text
NEXT_PUBLIC_GENLAYER_NETWORK
aNEXT_PUBLIC_GENLAYER_RPC
NEXT_PUBLIC_GENLAYER_EXPLORER
NEXT_PUBLIC_GENLAYER_CHAIN_ID
NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS
NEXT_PUBLIC_DEMO_FALLBACK
```

Private test/deployment value:

```text
GENLAYER_PRIVATE_KEY
```

Never rename the private key to a `NEXT_PUBLIC_*` variable.

---

## 15. Security invariants

### Finality invariant

No call to `Escrow.settle()` can succeed until a VerdictX message emitted with `on="finalized"` has executed successfully against the escrow.

### Identity invariant

The escrow accepts a verdict only when:

```text
msg.sender == configured_verdict_contract
```

### Case invariant

The bridge carries the case ID and escrow requires an exact match.

### Percentage invariant

```text
0 <= provider_percentage <= 100
FULL_FULFILLMENT => 100
NON_FULFILLMENT  => 0
PARTIAL_FULFILLMENT => exact calculated percentage
```

### Conservation invariant

```text
provider_amount + buyer_refund == escrow_amount
```

### Failure invariant

`INVALID_CASE` and `INCONCLUSIVE` never release funds automatically.

### Caller invariant

Only the buyer can fund or execute the final settlement. Only the configured VerdictX contract can authorize the verdict.

---

## 16. What this MVP intentionally does not claim

VerdictX is a hackathon MVP, not a production financial institution.

It does **not** claim:

- legal enforceability of AI-generated decisions;
- perfect factual accuracy from external websites;
- perfect LLM reasoning;
- that every frontend screen is on-chain;
- that an `ACCEPTED` GenLayer transaction is irreversible;
- tokenized USDC settlement — the current escrow uses native GEN;
- persistent server-side indexing — the browser case index currently uses local storage.

The core claim is narrower and testable:

> **A finalized GenLayer adjudication can cryptographically/protocol-wise authorize a deterministic escrow split without giving the frontend authority to fabricate the verdict.**

---

## 17. Hackathon track alignment

### Agent Commerce

Agents can buy and sell work without requiring a centralized platform to be the permanent counterparty and referee.

### Dispute Resolution

VerdictX converts subjective fulfillment disputes into structured adjudication with evidence, reasoning, confidence and a percentage settlement.

### Intelligent Contracts

The product is fundamentally dependent on GenLayer's ability to combine non-deterministic web/LLM execution with consensus and finality.

This is not an LLM wrapper placed beside a blockchain. **The adjudication itself is the Intelligent Contract execution.**

---

## 18. Why the architecture is stronger than a single-contract demo

A common shortcut is to put the AI verdict and the escrow balance in the same contract and then expose a settlement function. That makes it difficult to express a strong boundary between provisional consensus and irreversible funds movement.

VerdictX intentionally separates them:

```text
                     ┌─────────────────────┐
                     │      VerdictX       │
                     │                     │
Agreement ──────────▶│ web evidence       │
Delivery ───────────▶│ LLM evaluation      │
Dispute ────────────▶│ consensus           │
                     │ decision + %        │
                     └─────────┬───────────┘
                               │
                      on='finalized'
                               │
                               ▼
                     ┌─────────────────────┐
                     │       Escrow        │
                     │                     │
                     │ case ID check       │
                     │ sender check        │
                     │ percentage check    │
                     │ finality gate       │
                     │ payout conservation │
                     └─────────┬───────────┘
                               │
                        buyer executes
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
                Provider               Buyer
                 payout                refund
```

The separation means the escrow does not need to trust the browser, an agent, a database, or an arbitrary administrator.

---

## 19. Development workflow

```bash
# frontend
a npm install
npm run lint
npm run build

# contracts
source .venv/bin/activate
pip install -r requirements.txt
npm run contract:lint
npm run contract:test

# local integration
gltest tests/integration/ -v -s

# public testnet
genlayer network set testnet-bradbury
genlayer network info
npm run deploy:smoke
```

Remove the accidental `a` from the first frontend command if copying this block manually: the canonical command is simply:

```bash
npm install
```

---

## 20. GenLayer references

- [GenLayer Networks](https://docs.genlayer.com/developers/networks)
- [Transaction statuses](https://docs.genlayer.com/understand-genlayer-protocol/core-concepts/transactions/transaction-statuses)
- [Finality](https://docs.genlayer.com/understand-genlayer-protocol/core-concepts/optimistic-democracy/finality)
- [Intelligent Contract messages](https://docs.genlayer.com/developers/intelligent-contracts/features/messages)
- [Interacting with Intelligent Contracts](https://docs.genlayer.com/developers/intelligent-contracts/features/interacting-with-intelligent-contracts)
- [GenLayerJS](https://docs.genlayer.com/api-references/genlayer-js)
- [CLI deployment](https://docs.genlayer.com/developers/intelligent-contracts/deploying/cli-deployment)
- [GenVM linter](https://docs.genlayer.com/api-references/genlayer-linter)
- [GenLayer testing suite](https://github.com/genlayerlabs/genlayer-testing-suite)

---

## License

MIT
