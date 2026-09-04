import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';

export type VerdictXTransaction = `0x${string}`;
type ClientAccount = string;

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS as `0x${string}` | undefined;

export function getGenLayerClient(account?: ClientAccount, provider?: any) {
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

export async function submitAdjudication(account: ClientAccount, agreement: string, delivery: string, dispute: string, evidenceUrls: string[], provider?: any): Promise<VerdictXTransaction> {
  const client = getGenLayerClient(account, provider);
  const write = { address: requireContractAddress(), functionName: 'adjudicate' as const, args: [agreement, delivery, dispute, evidenceUrls] as const };
  const fees = await client.estimateTransactionFeesForWrite(write);
  return client.writeContract({ ...write, fees: { distribution: fees.distribution, feeValue: fees.feeValue } }) as Promise<VerdictXTransaction>;
}

export async function waitForAdjudication(hash: VerdictXTransaction) {
  return getGenLayerClient().waitForDecision({ hash });
}

export async function getAdjudicationTransaction(hash: VerdictXTransaction) {
  return getGenLayerClient().getTransaction({ hash });
}
