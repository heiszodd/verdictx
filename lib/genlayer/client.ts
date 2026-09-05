import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { ExecutionResult, TransactionStatus } from 'genlayer-js/types';

export type VerdictXTransaction = `0x${string}`;
type ClientAccount = `0x${string}`;
type Eip1193Provider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS as `0x${string}` | undefined;

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

  // This project is currently pinned to the installed GenLayerJS API,
  // whose writeContract accepts value but does not expose the newer fees API.
  const txHash = await client.writeContract({
    address: requireContractAddress(),
    functionName: 'adjudicate',
    args: [agreement, delivery, dispute, evidenceUrls],
    value: 0n,
  });

  return txHash as VerdictXTransaction;
}

function assertSuccessful(transaction: any) {
  const statusName = transaction?.statusName ?? transaction?.status_name;
  const executionResultName = transaction?.txExecutionResultName ?? transaction?.tx_execution_result_name;
  const accepted = statusName === TransactionStatus.ACCEPTED || statusName === TransactionStatus.FINALIZED;
  const returned = executionResultName === ExecutionResult.FINISHED_WITH_RETURN;

  if (!accepted || !returned) {
    throw new Error(
      `Transaction failed: ${statusName ?? 'Unknown'} / ${executionResultName ?? 'Unknown'}`,
    );
  }
}

export async function waitForAdjudication(hash: VerdictXTransaction) {
  const transaction = await getGenLayerClient().waitForTransactionReceipt({
    hash: hash as any,
    status: TransactionStatus.ACCEPTED,
  });
  assertSuccessful(transaction);
  return transaction;
}

export async function waitForAdjudicationFinalization(hash: VerdictXTransaction) {
  const client = getGenLayerClient();
  const transaction = await client.waitForTransactionReceipt({
    hash: hash as any,
    status: TransactionStatus.FINALIZED,
  });
  assertSuccessful(transaction);
  return transaction;
}

export async function getAdjudicationTransaction(hash: VerdictXTransaction) {
  return getGenLayerClient().getTransaction({ hash: hash as any });
}
