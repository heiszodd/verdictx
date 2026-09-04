import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import type { Account } from 'genlayer-js/types';

export type VerdictXTransaction = `0x${string}`;

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS as `0x${string}` | undefined;

export function getGenLayerClient(account?: Account) {
  return createClient({
    chain: testnetBradbury,
    ...(account ? { account } : {}),
  });
}

export function requireContractAddress() {
  if (!CONTRACT_ADDRESS) {
    throw new Error('NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS is not configured');
  }
  return CONTRACT_ADDRESS;
}

export async function getVerdict(account?: Account) {
  const client = getGenLayerClient(account);
  return client.readContract({
    address: requireContractAddress(),
    functionName: 'get_verdict',
    args: [],
  });
}

export async function submitAdjudication(
  account: Account,
  agreement: string,
  delivery: string,
  dispute: string,
  evidenceUrls: string[],
): Promise<VerdictXTransaction> {
  const client = getGenLayerClient(account);
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

export async function waitForAdjudication(hash: VerdictXTransaction) {
  const client = getGenLayerClient();
  return client.waitForDecision({ hash });
}

export async function getAdjudicationTransaction(hash: VerdictXTransaction) {
  const client = getGenLayerClient();
  return client.getTransaction({ hash });
}
