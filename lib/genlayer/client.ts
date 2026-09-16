import { createClient } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import { VERDICTX_CONTRACT_SOURCE } from './verdictx-source';
import { ESCROW_CONTRACT_SOURCE } from './escrow-source';

type ClientAccount = `0x${string}`;
export type VerdictXTransaction = `0x${string}`;
export type Eip1193Provider = {
  request: (args: { method: string; params?: readonly unknown[] }) => Promise<unknown>;
};
type GenLayerClient = ReturnType<typeof createClient>;
type UnknownRecord = Record<string, unknown>;

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS as `0x${string}` | undefined;
const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS as `0x${string}` | undefined;
const GENLAYER_CHAIN_ID_HEX = '0xf22d';
const GENLAYER_RPC = process.env.NEXT_PUBLIC_GENLAYER_RPC || 'https://studio-dev.genlayer.com/api';
const GENLAYER_EXPLORER = process.env.NEXT_PUBLIC_GENLAYER_EXPLORER || 'https://explorer-studio-dev.genlayer.com';
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 360;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' ? (value as UnknownRecord) : null;
}
function readString(value: unknown, ...keys: string[]): string | undefined {
  const record = asRecord(value);
  for (const key of keys) {
    const candidate = record?.[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return undefined;
}
function readBoolean(value: unknown, ...keys: string[]): boolean | undefined {
  const record = asRecord(value);
  for (const key of keys) {
    const candidate = record?.[key];
    if (typeof candidate === 'boolean') return candidate;
  }
  return undefined;
}
function readNumber(value: unknown, ...keys: string[]): number | undefined {
  const record = asRecord(value);
  for (const key of keys) {
    const candidate = record?.[key];
    const number = typeof candidate === 'number'
      ? candidate
      : typeof candidate === 'string' && candidate.trim()
        ? Number(candidate)
        : NaN;
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}
function requireAddress(value: unknown, label = 'Contract address'): `0x${string}` {
  if (typeof value !== 'string' || !ADDRESS_RE.test(value)) {
    throw new Error(`${label} is missing or invalid. Expected a 20-byte EVM address.`);
  }
  return value as `0x${string}`;
}
function normalizeAddress(value: string): `0x${string}` {
  return requireAddress(value).toLowerCase() as `0x${string}`;
}

/**
 * IMPORTANT: Studio-dev is a distinct GenLayer deployment. Never derive its
 * chain definition from Bradbury or Studionet. studioDevnet carries the
 * matching chain/RPC/consensus configuration from the RC SDK.
 */
export function getGenLayerClient(
  account?: ClientAccount,
  provider?: Eip1193Provider,
): GenLayerClient {
  return createClient({
    chain: studioDevnet,
    ...(account ? { account } : {}),
    ...(provider ? { provider } : {}),
  } as Parameters<typeof createClient>[0]);
}

export function requireContractAddress(): `0x${string}` {
  return requireAddress(CONTRACT_ADDRESS, 'NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS');
}
export function requireEscrowAddress(): `0x${string}` {
  return requireAddress(ESCROW_ADDRESS, 'NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS');
}

async function ensureGenLayerNetwork(provider: Eip1193Provider): Promise<void> {
  const currentChainId = String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
  if (currentChainId === GENLAYER_CHAIN_ID_HEX) return;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: GENLAYER_CHAIN_ID_HEX }],
    });
  } catch (error) {
    const code = asRecord(error)?.code;
    if (code !== 4902) throw error;

    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: GENLAYER_CHAIN_ID_HEX,
        chainName: 'GenLayer Studio Devnet',
        nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
        rpcUrls: [GENLAYER_RPC],
        blockExplorerUrls: [GENLAYER_EXPLORER],
      }],
    });
  }

  const verifiedChainId = String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
  if (verifiedChainId !== GENLAYER_CHAIN_ID_HEX) {
    throw new Error(`Wrong wallet network. Expected ${GENLAYER_CHAIN_ID_HEX}, got ${verifiedChainId}.`);
  }
}

function genToWei(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(normalized)) {
    throw new Error('Enter a valid GEN amount with up to 18 decimal places.');
  }
  const [whole, fraction = ''] = normalized.split('.');
  return BigInt(whole) * 10n ** 18n + BigInt((fraction + '0'.repeat(18)).slice(0, 18));
}
function statusName(transaction: unknown): string {
  return (readString(transaction, 'statusName', 'status_name') ?? 'UNKNOWN').toUpperCase();
}
function executionName(transaction: unknown): string {
  return (readString(transaction, 'txExecutionResultName', 'tx_execution_result_name') ?? 'NOT_VOTED').toUpperCase();
}
function transactionSucceeded(transaction: unknown): boolean {
  return statusName(transaction) === 'FINALIZED' && executionName(transaction) === 'FINISHED_WITH_RETURN';
}

async function deployedAddress(client: GenLayerClient, hash: VerdictXTransaction): Promise<`0x${string}`> {
  const receipt = await client.waitForTransactionReceipt({
    hash: hash as never,
    status: TransactionStatus.FINALIZED,
  });
  if (!transactionSucceeded(receipt)) {
    throw new Error(`Deployment failed: ${statusName(receipt)} / ${executionName(receipt)}`);
  }
  const direct = readString(receipt, 'contractAddress', 'contract_address');
  if (direct) return requireAddress(direct, 'Deployed contract address');
  const tx = await client.getTransaction({ hash: hash as never });
  return requireAddress(
    readString(tx, 'recipient', 'contractAddress', 'contract_address'),
    'Deployed contract address',
  );
}

export async function deployVerdictXCase(
  account: ClientAccount,
  caseId: string,
  providerAddress: `0x${string}`,
  provider: Eip1193Provider,
): Promise<{
  hash: VerdictXTransaction;
  address: `0x${string}`;
  escrowAddress: `0x${string}`;
  escrowHash: VerdictXTransaction;
  configureHash: VerdictXTransaction;
}> {
  const buyer = normalizeAddress(account);
  const providerAddr = normalizeAddress(providerAddress);
  await ensureGenLayerNetwork(provider);
  const client = getGenLayerClient(account, provider);

  const escrowHash = await client.deployContract({
    account,
    code: ESCROW_CONTRACT_SOURCE.trimStart(),
    args: [caseId, buyer, providerAddr],
  }) as VerdictXTransaction;
  const escrowAddress = await deployedAddress(client, escrowHash);

  const hash = await client.deployContract({
    account,
    code: VERDICTX_CONTRACT_SOURCE.trimStart(),
    args: [caseId, providerAddr, escrowAddress],
  }) as VerdictXTransaction;
  const address = await deployedAddress(client, hash);

  const configureHash = await client.writeContract({
    account,
    address: escrowAddress,
    functionName: 'set_verdict_contract',
    args: [address],
    value: 0n,
  }) as VerdictXTransaction;
  const configured = await client.waitForTransactionReceipt({
    hash: configureHash as never,
    status: TransactionStatus.FINALIZED,
  });
  if (!transactionSucceeded(configured)) {
    throw new Error('Escrow/verdict bridge configuration did not finalize successfully.');
  }

  return { hash, address, escrowAddress, escrowHash, configureHash };
}

export async function fundEscrow(
  account: ClientAccount,
  contractAddress: `0x${string}`,
  amountGen: string,
  provider: Eip1193Provider,
): Promise<VerdictXTransaction> {
  const address = requireAddress(contractAddress);
  await ensureGenLayerNetwork(provider);
  const amount = genToWei(amountGen);
  if (amount <= 0n) throw new Error('Escrow amount must be greater than zero.');
  return await getGenLayerClient(account, provider).writeContract({
    account,
    address,
    functionName: 'fund',
    args: [],
    value: amount,
  }) as VerdictXTransaction;
}

export async function settleEscrow(
  account: ClientAccount,
  contractAddress: `0x${string}`,
  provider: Eip1193Provider,
  adjudicationHash: VerdictXTransaction,
): Promise<VerdictXTransaction> {
  const address = requireAddress(contractAddress);
  await ensureGenLayerNetwork(provider);
  const adjudication = await getAdjudicationTransaction(adjudicationHash);
  if (adjudication.status !== 'FINALIZED' || adjudication.execution !== 'FINISHED_WITH_RETURN') {
    throw new Error('Settlement is locked until the GenLayer adjudication transaction is FINALIZED and successful.');
  }
  const escrow = await getEscrowState(address);
  if (!escrow.verdictFinalized) throw new Error('The finalized verdict has not reached the escrow settlement bridge yet.');
  if (escrow.settlementBlocked) throw new Error('This case is INVALID or INCONCLUSIVE; escrow remains locked.');
  return await getGenLayerClient(account, provider).writeContract({
    account,
    address,
    functionName: 'settle',
    args: [],
    value: 0n,
  }) as VerdictXTransaction;
}

export async function getEscrowState(contractAddress: `0x${string}`) {
  const address = requireAddress(contractAddress);
  const client = getGenLayerClient();
  const names = [
    'get_amount', 'is_funded', 'is_verdict_finalized', 'is_settlement_blocked',
    'is_settled', 'get_decision', 'get_payment_percentage', 'get_provider_amount',
    'get_buyer_refund', 'get_verdict_contract', 'get_case',
  ];
  const [amount, funded, verdictFinalized, blocked, settled, decision, paymentPercentage,
    providerAmount, buyerRefund, verdictContract, caseId] = await Promise.all(
    names.map((functionName) => client.readContract({ address, functionName, args: [] })),
  );
  const toGen = (raw: unknown): number => Number(raw) / 1e18;
  return {
    caseId: String(caseId),
    verdictContract: String(verdictContract),
    amount: toGen(amount),
    funded: Boolean(funded),
    verdictFinalized: Boolean(verdictFinalized),
    settlementBlocked: Boolean(blocked),
    settled: Boolean(settled),
    decision: String(decision),
    paymentPercentage: Number(paymentPercentage),
    providerAmount: toGen(providerAmount),
    buyerRefund: toGen(buyerRefund),
  };
}

export async function getVerdictForContract(address: `0x${string}`) {
  return getGenLayerClient().readContract({
    address: requireAddress(address),
    functionName: 'get_verdict',
    args: [],
  });
}

export async function submitAdjudication(
  account: ClientAccount,
  contractAddress: `0x${string}`,
  agreement: string,
  delivery: string,
  dispute: string,
  evidenceUrls: string[],
  provider?: Eip1193Provider,
): Promise<VerdictXTransaction> {
  const address = requireAddress(contractAddress);
  if (!provider) throw new Error('A connected browser wallet is required to submit adjudication.');
  await ensureGenLayerNetwork(provider);
  const client = getGenLayerClient(account, provider);

  // v2.0.0-rc.1 uses the v0.6 calldata encoder. Passing this through the
  // SDK is important; hand-built viem calldata is not equivalent.
  return await client.writeContract({
    account,
    address,
    functionName: 'adjudicate',
    args: [agreement, delivery, dispute, JSON.stringify(evidenceUrls || [])],
    value: 0n,
  }) as VerdictXTransaction;
}

export type AdjudicationStatus = {
  hash: VerdictXTransaction;
  status: string;
  execution: string;
  lifecycle: string;
  projectedStatus?: string;
  resolutionAction?: string;
  resolutionSource?: string;
  decisionActive?: boolean;
  queuePosition?: number | null;
  recipient?: string;
  error?: string;
  executionHash?: string;
  timestamps?: Record<string, unknown>;
  raw: unknown;
};

function lifecycleForStatus(status: string): string {
  if (['PENDING', 'PROPOSING', 'COMMITTING', 'REVEALING', 'LEADER_REVEALING', 'APPEAL_COMMITTING', 'APPEAL_REVEALING'].includes(status)) return 'PROCESSING';
  if (['ACCEPTED', 'UNDETERMINED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'].includes(status)) return 'DECIDED';
  if (status === 'FINALIZED') return 'FINALIZED';
  if (status === 'CANCELED') return 'CANCELED';
  return 'PROCESSING';
}
function extractExecutionError(transaction: unknown): string | undefined {
  const record = asRecord(transaction);
  const candidates = [
    record?.error, record?.executionError, record?.txExecutionError,
    record?.txExecutionResultMessage, record?.resultMessage, record?.errorMessage,
    asRecord(record?.txDataDecoded)?.error, asRecord(record?.receipt)?.error,
  ];
  for (const value of candidates) if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}
async function getLifecycleProjection(client: GenLayerClient, hash: VerdictXTransaction): Promise<UnknownRecord | null> {
  try {
    return asRecord(await client.request({ method: 'gen_getTransactionLifecycle', params: [{ txId: hash }] }));
  } catch {
    return null;
  }
}

export async function getAdjudicationTransaction(hash: VerdictXTransaction): Promise<AdjudicationStatus> {
  const client = getGenLayerClient();
  const transaction = await client.getTransaction({ hash: hash as never });
  const status = statusName(transaction);
  const projection = await getLifecycleProjection(client, hash);
  const lifecycle = (readString(projection, 'lifecycle', 'state') ?? lifecycleForStatus(status)).toUpperCase();
  const record = asRecord(transaction);
  let queuePosition = readNumber(record, 'queuePosition', 'queue_position') ?? null;
  if (status === 'PENDING' && queuePosition === null) {
    try {
      const number = Number(await client.getTransactionQueuePosition({ hash: hash as never }));
      queuePosition = Number.isFinite(number) ? number : null;
    } catch {
      queuePosition = null;
    }
  }
  return {
    hash,
    status,
    execution: executionName(transaction),
    lifecycle,
    projectedStatus: (readString(projection, 'projectedStatus', 'projected_status') ?? status).toUpperCase(),
    resolutionAction: readString(projection, 'resolutionAction', 'resolution_action'),
    resolutionSource: readString(projection, 'resolutionSource', 'resolution_source'),
    decisionActive: readBoolean(projection, 'decisionActive', 'decision_active'),
    queuePosition,
    recipient: readString(record, 'recipient'),
    error: extractExecutionError(transaction),
    executionHash: readString(record, 'txExecutionHash', 'tx_execution_hash'),
    timestamps: asRecord(record?.timestamps) ?? undefined,
    raw: transaction,
  };
}

function assertSuccessful(transaction: unknown): void {
  if (!transactionSucceeded(transaction)) {
    throw new Error(`Transaction failed: ${statusName(transaction)} / ${executionName(transaction)}`);
  }
}

export async function waitForAdjudication(hash: VerdictXTransaction, onUpdate?: (status: AdjudicationStatus) => void) {
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    const snapshot = await getAdjudicationTransaction(hash);
    onUpdate?.(snapshot);
    if (['ACCEPTED', 'FINALIZED', 'UNDETERMINED', 'CANCELED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'].includes(snapshot.status)) {
      assertSuccessful(snapshot.raw);
      return snapshot.raw;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('Transaction is still processing after 30 minutes. Keep the transaction ID and resume tracking instead of submitting again.');
}

export async function waitForAdjudicationFinalization(hash: VerdictXTransaction, onUpdate?: (status: AdjudicationStatus) => void) {
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    const snapshot = await getAdjudicationTransaction(hash);
    onUpdate?.(snapshot);
    if (snapshot.status === 'FINALIZED') {
      assertSuccessful(snapshot.raw);
      return snapshot.raw;
    }
    if (['CANCELED', 'UNDETERMINED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'].includes(snapshot.status)) {
      throw new Error(`Adjudication reached ${snapshot.status}; no irreversible settlement is authorized.`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('Finalization is still pending. Keep the transaction ID and resume tracking.');
}

export async function waitForTransactionFinalization(hash: VerdictXTransaction) {
  const receipt = await getGenLayerClient().waitForTransactionReceipt({
    hash: hash as never,
    status: TransactionStatus.FINALIZED,
  });
  assertSuccessful(receipt);
  return receipt;
}

export function getDemoFallbackEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_FALLBACK === 'true';
}
