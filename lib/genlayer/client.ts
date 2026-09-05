import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';

export type VerdictXTransaction = `0x${string}`;
type ClientAccount = string;
type Eip1193Provider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS as `0x${string}` | undefined;

export function getGenLayerClient(account?: ClientAccount, provider?: Eip1193Provider) {
  return createClient({
    chain: testnetBradbury,
    ...(account ? { account } : {}),
    ...(provider ? { provider } : {}),
  });
}

export function requireContractAddress() {
  if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
    throw new Error('NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS is not configured');
  }
  return CONTRACT_ADDRESS;
}

export async function getVerdict(account?: ClientAccount) {
  const client = getGenLayerClient(account);
  return client.readContract({ address: requireContractAddress(), functionName: 'get_verdict', args: [] });
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

  if (provider) {
    await client.connect('testnetBradbury');
  }

  const write = {
    address: requireContractAddress(),
    functionName: 'adjudicate' as const,
    args: [agreement, delivery, dispute, evidenceUrls] as const,
  };

  const fees = await client.estimateTransactionFeesForWrite(write);
  return client.writeContract({
    ...write,
    fees: {
      distribution: fees.distribution,
      feeValue: fees.feeValue,
    },
  }) as Promise<VerdictXTransaction>;
}

function assertSuccessful(transaction: { statusName?: string; txExecutionResultName?: string }) {
  const accepted = transaction.statusName === 'Accepted' || transaction.statusName === 'Finalized';
  const returned = transaction.txExecutionResultName === 'FinishedWithReturn';
  if (!accepted || !returned) {
    throw new Error(
      `Transaction failed: ${transaction.statusName ?? 'Unknown'} / ${transaction.txExecutionResultName ?? 'Unknown'}`,
    );
  }
}

export async function waitForAdjudication(hash: VerdictXTransaction) {
  const transaction = await getGenLayerClient().waitForDecision({ hash });
  assertSuccessful(transaction);
  return transaction;
}

export async function waitForAdjudicationFinalization(hash: VerdictXTransaction) {
  const transaction = await getGenLayerClient().waitForFinalization({ hash });
  assertSuccessful(transaction);
  return transaction;
}

export async function getAdjudicationTransaction(hash: VerdictXTransaction) {
  return getGenLayerClient().getTransaction({ hash });
}
