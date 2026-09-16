import { createClient } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import { VERDICTX_CONTRACT_SOURCE } from './verdictx-source';
import { ESCROW_CONTRACT_SOURCE } from './escrow-source';

type ClientAccount = `0x${string}`;
export type VerdictXTransaction = `0x${string}`;
export type Eip1193Provider = { request: (args: { method: string; params?: readonly unknown[] }) => Promise<unknown> };
type GenLayerClient = ReturnType<typeof createClient>;
type UnknownRecord = Record<string, unknown>;
type WalletAccount = { address: ClientAccount; type: 'json-rpc' };

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS as `0x${string}` | undefined;
const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS as `0x${string}` | undefined;
const GENLAYER_CHAIN_ID_HEX = '0xf22d';
const GENLAYER_RPC = process.env.NEXT_PUBLIC_GENLAYER_RPC || 'https://studio-dev.genlayer.com/api';
const GENLAYER_EXPLORER = process.env.NEXT_PUBLIC_GENLAYER_EXPLORER || 'https://explorer-studio-dev.genlayer.com';
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function asRecord(value: unknown): UnknownRecord | null { return value !== null && typeof value === 'object' ? value as UnknownRecord : null; }
function readString(value: unknown, ...keys: string[]): string | undefined { const record = asRecord(value); for (const key of keys) { const candidate = record?.[key]; if (typeof candidate === 'string' && candidate.trim()) return candidate.trim(); } return undefined; }
function readBoolean(value: unknown, ...keys: string[]): boolean | undefined { const record = asRecord(value); for (const key of keys) { const candidate = record?.[key]; if (typeof candidate === 'boolean') return candidate; } return undefined; }
function readNumber(value: unknown, ...keys: string[]): number | undefined { const record = asRecord(value); for (const key of keys) { const candidate = record?.[key]; const number = typeof candidate === 'number' ? candidate : typeof candidate === 'string' && candidate.trim() ? Number(candidate) : NaN; if (Number.isFinite(number)) return number; } return undefined; }
function requireAddress(value: unknown, label = 'Contract address'): `0x${string}` { if (typeof value !== 'string' || !ADDRESS_RE.test(value)) throw new Error(`${label} is missing or invalid. Expected a 20-byte EVM address.`); return value as `0x${string}`; }
function normalizeAddress(value: string): ClientAccount { return requireAddress(value).toLowerCase() as ClientAccount; }
function walletAccount(address: ClientAccount): WalletAccount { return { address, type: 'json-rpc' }; }

export function getGenLayerClient(account?: ClientAccount, provider?: Eip1193Provider): GenLayerClient { return createClient({ chain: studioDevnet, ...(account ? { account } : {}), ...(provider ? { provider } : {}) } as Parameters<typeof createClient>[0]); }
export function requireContractAddress(): `0x${string}` { return requireAddress(CONTRACT_ADDRESS, 'NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS'); }
export function requireEscrowAddress(): `0x${string}` { return requireAddress(ESCROW_ADDRESS, 'NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS'); }

async function ensureGenLayerNetwork(provider: Eip1193Provider): Promise<void> {
  const currentChainId = String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
  if (currentChainId !== GENLAYER_CHAIN_ID_HEX) {
    try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: GENLAYER_CHAIN_ID_HEX }] }); }
    catch (error) { const code = asRecord(error)?.code; if (code !== 4902) throw error; await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: GENLAYER_CHAIN_ID_HEX, chainName: 'GenLayer Studio Devnet', nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 }, rpcUrls: [GENLAYER_RPC], blockExplorerUrls: [GENLAYER_EXPLORER] }] }); }
  }
  const verifiedChainId = String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
  if (verifiedChainId !== GENLAYER_CHAIN_ID_HEX) throw new Error(`Wrong wallet network. Expected ${GENLAYER_CHAIN_ID_HEX}, got ${verifiedChainId}.`);
}

function genToWei(value: string): bigint { const normalized = value.trim(); if (!/^\d+(\.\d{1,18})?$/.test(normalized)) throw new Error('Enter a valid GEN amount with up to 18 decimal places.'); const [whole, fraction = ''] = normalized.split('.'); return BigInt(whole) * 10n ** 18n + BigInt((fraction + '0'.repeat(18)).slice(0, 18)); }
function statusName(transaction: unknown): string { return (readString(transaction, 'statusName', 'status_name') ?? 'UNKNOWN').toUpperCase(); }
function executionName(transaction: unknown): string { return (readString(transaction, 'txExecutionResultName', 'tx_execution_result_name') ?? 'NOT_VOTED').toUpperCase(); }
function transactionSucceeded(transaction: unknown): boolean { return ['ACCEPTED', 'FINALIZED'].includes(statusName(transaction)) && executionName(transaction) === 'FINISHED_WITH_RETURN'; }

function findAddress(value: unknown): `0x${string}` | undefined {
  if (typeof value === 'string') { if (ADDRESS_RE.test(value)) return value as `0x${string}`; if (/^0x[0-9a-fA-F]{64}$/.test(value)) { const candidate = `0x${value.slice(-40)}`; if (ADDRESS_RE.test(candidate) && candidate !== '0x0000000000000000000000000000000000000000') return candidate as `0x${string}`; } return undefined; }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ['contractAddress','contract_address','deployedAddress','deployed_address','address']) { const found = findAddress(record[key]); if (found) return found; }
  for (const key of ['returnData','return_data','txExecutionResult','tx_execution_result','result']) { const found = findAddress(record[key]); if (found) return found; }
  return undefined;
}

async function deployedAddress(client: GenLayerClient, hash: VerdictXTransaction): Promise<`0x${string}`> { const receipt = await client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.FINALIZED, fullTransaction: true }); if (!transactionSucceeded(receipt)) throw new Error(`Deployment failed: ${statusName(receipt)} / ${executionName(receipt)}`); const direct = findAddress(receipt); if (direct) return direct; const tx = await client.getTransaction({ hash: hash as never }); const fromTx = findAddress(tx); if (fromTx) return fromTx; throw new Error('GenLayer deployment finalized, but the deployed contract address was not returned by Studio-dev.'); }

async function estimateWriteFees(client: GenLayerClient, write: { address: `0x${string}`; functionName: string; args?: unknown[]; value?: bigint }) { return client.estimateTransactionFeesForWrite(write as never); }
async function estimateDeployFees(client: GenLayerClient) { return client.estimateTransactionFees({ leaderTimeunitsAllocation: 125n, validatorTimeunitsAllocation: 250n, executionBudgetPerRound: 786_500n, totalMessageFees: 0n, appealRounds: 1n, rotations: [1n, 1n] }); }

async function estimateAdjudicationFees(client: GenLayerClient, write: { address: `0x${string}`; functionName: string; args?: unknown[]; value?: bigint }) {
  // First simulate with a deliberately generous parent budget. Then derive the
  // final fee preset from Studio's actual GenVM accounting. This is the explicit
  // two-step path recommended by GenLayer for debugging and message-producing
  // writes; importantly, we do not hand-build messageAllocations.
  const baseline = await client.estimateTransactionFees({
    leaderTimeunitsAllocation: 125n,
    validatorTimeunitsAllocation: 250n,
    executionBudgetPerRound: 10_000_000_000n,
    totalMessageFees: 1_000_000_000_000_000_000n,
    appealRounds: 1n,
    rotations: [1n, 1n],
  });

  const simulation = await client.simulateWriteContract({
    ...write,
    fees: {
      distribution: baseline.distribution,
      feeValue: baseline.feeValue,
    },
    includeReceipt: true,
  } as never);

  return client.estimateTransactionFeesFromSimulation({ simulation: simulation as never });
}

export async function deployVerdictXCase(account: ClientAccount, caseId: string, providerAddress: `0x${string}`, provider: Eip1193Provider): Promise<{ hash: VerdictXTransaction; address: `0x${string}`; escrowAddress: `0x${string}`; escrowHash: VerdictXTransaction; configureHash: VerdictXTransaction }> {
  const buyer = normalizeAddress(account); const providerAddr = normalizeAddress(providerAddress); await ensureGenLayerNetwork(provider); const client = getGenLayerClient(account, provider); const sender = walletAccount(buyer); const deployFees = await estimateDeployFees(client);
  const escrowHash = await client.deployContract({ account: sender, code: ESCROW_CONTRACT_SOURCE.trimStart(), args: [caseId, buyer, providerAddr], fees: deployFees }) as VerdictXTransaction; const escrowAddress = await deployedAddress(client, escrowHash);
  const verdictDeployFees = await estimateDeployFees(client); const hash = await client.deployContract({ account: sender, code: VERDICTX_CONTRACT_SOURCE.trimStart(), args: [caseId, providerAddr, escrowAddress], fees: verdictDeployFees }) as VerdictXTransaction; const address = await deployedAddress(client, hash);
  const configureWrite = { address: escrowAddress, functionName: 'set_verdict_contract', args: [address], value: 0n }; const configureFees = await estimateWriteFees(client, configureWrite); const configureHash = await client.writeContract({ account: sender, ...configureWrite, fees: configureFees }) as VerdictXTransaction; const configured = await client.waitForTransactionReceipt({ hash: configureHash as never, status: TransactionStatus.FINALIZED }); if (!transactionSucceeded(configured)) throw new Error('Escrow/verdict bridge configuration did not finalize successfully.');
  return { hash, address, escrowAddress, escrowHash, configureHash };
}

export async function fundEscrow(account: ClientAccount, contractAddress: `0x${string}`, amountGen: string, provider: Eip1193Provider): Promise<VerdictXTransaction> { const address = requireAddress(contractAddress); await ensureGenLayerNetwork(provider); const amount = genToWei(amountGen); if (amount <= 0n) throw new Error('Escrow amount must be greater than zero.'); const client = getGenLayerClient(account, provider); const write = { address, functionName: 'fund', args: [], value: amount }; const fees = await estimateWriteFees(client, write); return await client.writeContract({ account: walletAccount(normalizeAddress(account)), ...write, fees }) as VerdictXTransaction; }

export async function settleEscrow(account: ClientAccount, contractAddress: `0x${string}`, provider: Eip1193Provider, adjudicationHash: VerdictXTransaction): Promise<VerdictXTransaction> { const address = requireAddress(contractAddress); await ensureGenLayerNetwork(provider); const adjudication = await getAdjudicationTransaction(adjudicationHash); if (adjudication.status !== 'FINALIZED' || adjudication.execution !== 'FINISHED_WITH_RETURN') throw new Error('Settlement is locked until the GenLayer adjudication transaction is FINALIZED and successful.'); const escrow = await getEscrowState(address); if (!escrow.verdictFinalized) throw new Error('The finalized verdict has not reached the escrow settlement bridge yet.'); if (escrow.settlementBlocked) throw new Error('This case is INVALID or INCONCLUSIVE; escrow remains locked.'); const client = getGenLayerClient(account, provider); const write = { address, functionName: 'settle', args: [], value: 0n }; const fees = await estimateWriteFees(client, write); return await client.writeContract({ account: walletAccount(normalizeAddress(account)), ...write, fees }) as VerdictXTransaction; }

export async function getEscrowState(contractAddress: `0x${string}`) { const address = requireAddress(contractAddress); const client = getGenLayerClient(); const names = ['get_amount','is_funded','is_verdict_finalized','is_settlement_blocked','is_settled','get_decision','get_payment_percentage','get_provider_amount','get_buyer_refund','get_verdict_contract','get_case']; const [amount,funded,verdictFinalized,blocked,settled,decision,paymentPercentage,providerAmount,buyerRefund,verdictContract,caseId] = await Promise.all(names.map((functionName) => client.readContract({ address, functionName, args: [] }))); const toGen = (raw: unknown): number => Number(raw) / 1e18; return { caseId: String(caseId), verdictContract: String(verdictContract), amount: toGen(amount), funded: Boolean(funded), verdictFinalized: Boolean(verdictFinalized), settlementBlocked: Boolean(blocked), settled: Boolean(settled), decision: String(decision), paymentPercentage: Number(paymentPercentage), providerAmount: toGen(providerAmount), buyerRefund: toGen(buyerRefund) }; }
export async function getVerdictForContract(address: `0x${string}`) { return getGenLayerClient().readContract({ address: requireAddress(address), functionName: 'get_verdict', args: [] }); }

export async function submitAdjudication(account: ClientAccount, contractAddress: `0x${string}`, agreement: string, delivery: string, dispute: string, evidenceUrls: string[], provider?: Eip1193Provider): Promise<VerdictXTransaction> {
  const address = requireAddress(contractAddress, 'VerdictX contract address'); if (!provider) throw new Error('A connected browser wallet is required to submit adjudication.'); await ensureGenLayerNetwork(provider); const sender = walletAccount(normalizeAddress(account)); const client = getGenLayerClient(sender.address, provider); const write = { address, functionName: 'adjudicate', args: [agreement, delivery, dispute, JSON.stringify(evidenceUrls || [])], value: 0n };
  const deployedEscrow = String(await client.readContract({ address, functionName: 'get_escrow', args: [] }));
  requireAddress(deployedEscrow, 'VerdictX escrow address');
  const fees = await estimateAdjudicationFees(client, write);
  return await client.writeContract({ account: sender, ...write, fees }) as VerdictXTransaction;
}

export type AdjudicationStatus = { hash: VerdictXTransaction; status: string; execution: string; lifecycle: string; projectedStatus?: string; resolutionAction?: string; resolutionSource?: string; decisionActive?: boolean; queuePosition?: number | null; recipient?: string; error?: string; executionHash?: string; timestamps?: Record<string, unknown>; raw: unknown };
function lifecycleForStatus(status: string): string { if (['PENDING','PROPOSING','COMMITTING','REVEALING','LEADER_REVEALING','APPEAL_COMMITTING','APPEAL_REVEALING'].includes(status)) return 'PROCESSING'; if (['ACCEPTED','UNDETERMINED','VALIDATORS_TIMEOUT','LEADER_TIMEOUT'].includes(status)) return 'DECIDED'; if (status === 'FINALIZED') return 'FINALIZED'; if (status === 'CANCELED') return 'CANCELED'; return 'PROCESSING'; }
function extractExecutionError(transaction: unknown): string | undefined { const record = asRecord(transaction); const candidates = [record?.error,record?.executionError,record?.txExecutionError,record?.txExecutionResultMessage,record?.resultMessage,record?.errorMessage,asRecord(record?.txDataDecoded)?.error,asRecord(record?.receipt)?.error]; for (const value of candidates) if (typeof value === 'string' && value.trim()) return value.trim(); return undefined; }
async function getLifecycleProjection(client: GenLayerClient, hash: VerdictXTransaction): Promise<UnknownRecord|null> { try { return asRecord(await client.request({ method: 'gen_getTransactionLifecycle', params: [{ txId: hash }] })); } catch { return null; } }
export async function getAdjudicationTransaction(hash: VerdictXTransaction): Promise<AdjudicationStatus> { const client = getGenLayerClient(); const transaction = await client.getTransaction({ hash: hash as never }); const status = statusName(transaction); const projection = await getLifecycleProjection(client, hash); const lifecycle = (readString(projection,'lifecycle','state') ?? lifecycleForStatus(status)).toUpperCase(); const execution = executionName(transaction); const error = extractExecutionError(transaction); return { hash, status, execution, lifecycle, projectedStatus: readString(projection,'projectedStatus','projected_status'), resolutionAction: readString(projection,'resolutionAction','resolution_action'), resolutionSource: readString(projection,'resolutionSource','resolution_source'), decisionActive: readBoolean(projection,'decisionActive','decision_active'), queuePosition: readNumber(projection,'queuePosition','queue_position') ?? null, recipient: readString(transaction,'recipient','to'), error, executionHash: readString(transaction,'executionHash','execution_hash'), timestamps: asRecord(transaction)?.timestamps as Record<string, unknown> | undefined, raw: transaction }; }

export function getExplorerUrl(hash: VerdictXTransaction): string { return `${GENLAYER_EXPLORER}/tx/${hash}`; }

export function getVerdictXContractAddress(): `0x${string}` { return requireContractAddress(); }
