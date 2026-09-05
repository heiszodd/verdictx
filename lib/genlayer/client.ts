import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { ExecutionResult, TransactionStatus } from 'genlayer-js/types';

export type VerdictXTransaction = `0x${string}`;
type ClientAccount = `0x${string}`;
type Eip1193Provider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS as `0x${string}` | undefined;
const BRADBURY_CHAIN_ID = '0x107d';
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 360;

const BRADBURY_NETWORK = {
  chainId: BRADBURY_CHAIN_ID,
  chainName: 'GenLayer Bradbury',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: ['https://rpc-bradbury.genlayer.com'],
  blockExplorerUrls: ['https://explorer-bradbury.genlayer.com'],
};

export function getGenLayerClient(account?: ClientAccount, provider?: Eip1193Provider) {
  return createClient({
    chain: testnetBradbury,
    ...(account ? { account: account as any } : {}),
    ...(provider ? { provider: provider as any } : {}),
  } as any);
}

export function requireContractAddress() {
  if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
    throw new Error('NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS is not configured');
  }
  return CONTRACT_ADDRESS;
}

async function ensureBradbury(provider: Eip1193Provider) {
  const currentChainId = String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
  if (currentChainId === BRADBURY_CHAIN_ID) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BRADBURY_CHAIN_ID }] });
  } catch (error) {
    const code = error && typeof error === 'object' ? (error as { code?: number }).code : undefined;
    if (code !== 4902) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [BRADBURY_NETWORK] });
  }
}

export async function getVerdict(account?: ClientAccount) {
  return getGenLayerClient(account).readContract({
    address: requireContractAddress(),
    functionName: 'get_verdict',
    args: [],
  });
}

export async function submitAdjudication(
  account: ClientAccount,
  agreement: string,
  delivery: string,
  dispute: string,
  evidenceUrls: string[],
  provider?: Eip1193Provider,
): Promise<VerdictXTransaction> {
  const client = getGenLayerClient(account, provider);
  if (provider) await ensureBradbury(provider);
  const txHash = await client.writeContract({
    address: requireContractAddress(),
    functionName: 'adjudicate',
    args: [agreement, delivery, dispute, evidenceUrls],
    value: 0n,
  });
  return txHash as VerdictXTransaction;
}

export type AdjudicationStatus = {
  hash: VerdictXTransaction;
  status: string;
  execution: string;
  lifecycle: string;
  queuePosition?: number | null;
  recipient?: string;
  raw: any;
};

function statusName(transaction: any): string {
  return String(transaction?.statusName ?? transaction?.status_name ?? 'UNKNOWN').toUpperCase();
}

function executionName(transaction: any): string {
  return String(transaction?.txExecutionResultName ?? transaction?.tx_execution_result_name ?? 'NOT_VOTED').toUpperCase();
}

function lifecycleForStatus(status: string): string {
  if (status === 'PENDING' || status === 'PROPOSING' || status === 'COMMITTING' || status === 'REVEALING' || status === 'LEADER_REVEALING') return 'PROCESSING';
  if (status === 'ACCEPTED' || status === 'UNDETERMINED' || status === 'VALIDATORS_TIMEOUT' || status === 'LEADER_TIMEOUT') return 'DECIDED';
  if (status === 'FINALIZED') return 'FINALIZED';
  if (status === 'CANCELED') return 'CANCELED';
  return 'PROCESSING';
}

export async function getAdjudicationTransaction(hash: VerdictXTransaction): Promise<AdjudicationStatus> {
  const client = getGenLayerClient();
  const transaction = await client.getTransaction({ hash: hash as any });
  const status = statusName(transaction);
  const rawQueuePosition = transaction?.queuePosition;
  let queuePosition: number | null = rawQueuePosition == null ? null : Number(rawQueuePosition);

  if (status === 'PENDING' && queuePosition === null) {
    try {
      const position = await client.getTransactionQueuePosition({ hash: hash as any });
      const numericPosition = Number(position);
      queuePosition = Number.isFinite(numericPosition) ? numericPosition : null;
    } catch {
      queuePosition = null;
    }
  }

  return {
    hash,
    status,
    execution: executionName(transaction),
    lifecycle: lifecycleForStatus(status),
    queuePosition,
    recipient: transaction?.recipient,
    raw: transaction,
  };
}

function assertSuccessful(transaction: any) {
  const status = statusName(transaction);
  const execution = executionName(transaction);
  const accepted = status === String(TransactionStatus.ACCEPTED).toUpperCase() || status === String(TransactionStatus.FINALIZED).toUpperCase();
  const returned = execution === String(ExecutionResult.FINISHED_WITH_RETURN).toUpperCase();
  if (!accepted || !returned) throw new Error(`Transaction failed: ${status} / ${execution}`);
}

export async function waitForAdjudication(hash: VerdictXTransaction, onUpdate?: (status: AdjudicationStatus) => void) {
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    const snapshot = await getAdjudicationTransaction(hash);
    onUpdate?.(snapshot);
    const terminal = ['ACCEPTED', 'FINALIZED', 'UNDETERMINED', 'CANCELED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'].includes(snapshot.status);
    if (terminal) {
      assertSuccessful(snapshot.raw);
      return snapshot.raw;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('Transaction is still processing after 30 minutes. The transaction ID is preserved; resume tracking instead of submitting again.');
}

export async function waitForAdjudicationFinalization(hash: VerdictXTransaction, onUpdate?: (status: AdjudicationStatus) => void) {
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    const snapshot = await getAdjudicationTransaction(hash);
    onUpdate?.(snapshot);
    if (snapshot.status === 'FINALIZED') {
      assertSuccessful(snapshot.raw);
      return snapshot.raw;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('Finalization is still pending. Keep the transaction ID and resume tracking later.');
}
