import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createAccount, createClient, isSuccessful } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

type Address = `0x${string}`;
type Hash = `0x${string}`;

const RPC = process.env.NEXT_PUBLIC_GENLAYER_RPC || 'https://rpc-bradbury.genlayer.com';
const PRIVATE_KEY = process.env.GENLAYER_PRIVATE_KEY as Hash | undefined;
const PROVIDER = process.env.SMOKE_PROVIDER_ADDRESS as Address | undefined;
const CASE_ID = process.env.SMOKE_CASE_ID || `VX-SMOKE-${Date.now()}`;
const FUND_AMOUNT = process.env.SMOKE_FUND_AMOUNT_GEN || '1';
const EVIDENCE_URLS = (process.env.SMOKE_EVIDENCE_URLS || 'https://example.com').split(',').map((v) => v.trim()).filter(Boolean).slice(0, 3);

function required<T>(value: T | undefined, name: string): T { if (!value) throw new Error(`${name} is required.`); return value; }
function address(value: string, name: string): Address { if (!/^0x[a-fA-F0-9]{40}$/.test(value)) throw new Error(`${name} must be a valid EVM address.`); return value as Address; }
function wei(value: string): bigint { const [whole, fraction = ''] = value.trim().split('.'); if (!/^\d+$/.test(whole) || !/^\d{0,18}$/.test(fraction)) throw new Error('SMOKE_FUND_AMOUNT_GEN must be a decimal GEN amount with at most 18 decimals.'); return BigInt(whole) * 10n ** 18n + BigInt((fraction + '0'.repeat(18)).slice(0, 18)); }
async function balance(rpc: string, who: Address): Promise<bigint> { const response = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [who, 'latest'] }) }); const body = await response.json() as { result?: string; error?: { message?: string } }; if (body.error) throw new Error(body.error.message || 'eth_getBalance failed'); if (!body.result) throw new Error('eth_getBalance returned no result'); return BigInt(body.result); }
async function waitFinal(client: ReturnType<typeof createClient>, hash: Hash, label: string) { const receipt = await client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.FINALIZED, interval: 5000, retries: 360 }); if (!isSuccessful(receipt)) throw new Error(`${label} failed: ${String((receipt as any).statusName)} / ${String((receipt as any).txExecutionResultName)}`); return receipt; }
async function deploy(client: ReturnType<typeof createClient>, codePath: string, args: unknown[]): Promise<{ hash: Hash; address: Address }> { const code = new Uint8Array(readFileSync(codePath)); const hash = await client.deployContract({ code, args }) as Hash; const receipt = await waitFinal(client, hash, `Deployment ${codePath}`); const direct = String((receipt as any).contractAddress || ''); if (/^0x[a-fA-F0-9]{40}$/.test(direct)) return { hash, address: direct as Address }; const tx = await client.getTransaction({ hash: hash as never }); const candidate = String((tx as any).recipient || (tx as any).contractAddress || ''); return { hash, address: address(candidate, `Deployed address for ${codePath}`) }; }

async function main() {
  const privateKey = required(PRIVATE_KEY, 'GENLAYER_PRIVATE_KEY');
  const provider = address(required(PROVIDER, 'SMOKE_PROVIDER_ADDRESS'), 'SMOKE_PROVIDER_ADDRESS');
  if (provider.toLowerCase() === createAccount(privateKey).address.toLowerCase()) throw new Error('SMOKE_PROVIDER_ADDRESS must be different from the buyer/deployer for a meaningful payout test.');
  const account = createAccount(privateKey);
  const buyer = account.address as Address;
  const client = createClient({ chain: { ...testnetBradbury, rpc: RPC } as never, account });

  console.log(`Buyer: ${buyer}`);
  console.log(`Provider: ${provider}`);
  console.log(`Case: ${CASE_ID}`);
  console.log(`Evidence: ${EVIDENCE_URLS.join(', ')}`);

  const buyerBefore = await balance(RPC, buyer);
  const providerBefore = await balance(RPC, provider);

  const escrow = await deploy(client, 'contracts/Escrow.py', [CASE_ID, buyer, provider]);
  console.log(`Escrow: ${escrow.address} (${escrow.hash})`);
  const verdict = await deploy(client, 'contracts/VerdictX.py', [CASE_ID, provider, escrow.address]);
  console.log(`VerdictX: ${verdict.address} (${verdict.hash})`);

  const configure = await client.writeContract({ address: escrow.address, functionName: 'set_verdict_contract', args: [verdict.address], value: 0n }) as Hash;
  await waitFinal(client, configure, 'Bridge configuration');

  const funding = await client.writeContract({ address: escrow.address, functionName: 'fund', args: [], value: wei(FUND_AMOUNT) }) as Hash;
  await waitFinal(client, funding, 'Escrow funding');

  const adjudication = await client.writeContract({ address: verdict.address, functionName: 'adjudicate', args: [
    'Provider must deliver 3 research findings, each backed by public evidence.',
    'Provider delivered 3 findings with source URLs and structured notes.',
    'Buyer disputes the completeness of one finding and asks for a proportional split.',
    EVIDENCE_URLS,
  ], value: 0n }) as Hash;
  console.log(`Adjudication submitted: ${adjudication}`);

  // This is deliberately FINALIZED, not merely ACCEPTED. Settlement is forbidden earlier.
  await waitFinal(client, adjudication, 'VerdictX adjudication');
  const finalized = await client.getTransaction({ hash: adjudication as never });
  if (String((finalized as any).statusName).toUpperCase() !== 'FINALIZED') throw new Error('Adjudication did not reach FINALIZED.');
  if (String((finalized as any).txExecutionResultName).toUpperCase() !== 'FINISHED_WITH_RETURN') throw new Error('Finalized adjudication did not execute successfully.');

  const children = await client.getTriggeredTransactionIds({ hash: adjudication as never });
  console.log(`Finalized bridge child transactions: ${children.length}`);
  for (const child of children) await waitFinal(client, child as Hash, `VerdictX → Escrow bridge ${child}`);

  const beforeSettle = await client.readContract({ address: escrow.address, functionName: 'get_payment_percentage', args: [] });
  const finalizedFlag = await client.readContract({ address: escrow.address, functionName: 'is_verdict_finalized', args: [] });
  const blocked = await client.readContract({ address: escrow.address, functionName: 'is_settlement_blocked', args: [] });
  if (!Boolean(finalizedFlag)) throw new Error('Escrow bridge did not authorize a finalized verdict.');
  if (Boolean(blocked)) throw new Error('Smoke case produced an INVALID/INCONCLUSIVE verdict; no settlement is permitted.');
  console.log(`Finalized provider percentage: ${String(beforeSettle)}%`);

  const settlement = await client.writeContract({ address: escrow.address, functionName: 'settle', args: [], value: 0n }) as Hash;
  await waitFinal(client, settlement, 'Escrow settlement');

  const providerPayout = await client.readContract({ address: escrow.address, functionName: 'get_provider_amount', args: [] });
  const buyerRefund = await client.readContract({ address: escrow.address, functionName: 'get_buyer_refund', args: [] });
  const fundedAmount = await client.readContract({ address: escrow.address, functionName: 'get_amount', args: [] });
  if (BigInt(String(providerPayout)) + BigInt(String(buyerRefund)) !== BigInt(String(fundedAmount))) throw new Error('Settlement conservation invariant failed.');

  const buyerAfter = await balance(RPC, buyer);
  const providerAfter = await balance(RPC, provider);
  console.log(`Buyer balance: ${buyerBefore} → ${buyerAfter} wei`);
  console.log(`Provider balance: ${providerBefore} → ${providerAfter} wei`);
  console.log(`Provider payout: ${providerPayout} wei`);
  console.log(`Buyer refund: ${buyerRefund} wei`);
  console.log(`Settlement TX: ${settlement}`);
  console.log('VERDICTX TESTNET SMOKE TEST PASSED');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
