import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';

export const VERDICTX_CONTRACT = process.env.NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS as `0x${string}` | undefined;

export function getReadClient() {
  return createClient({ chain: testnetBradbury });
}

function requireContractAddress(contractAddress?: `0x${string}`) {
  const address = contractAddress ?? VERDICTX_CONTRACT;
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    throw new Error('NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS is not configured');
  }
  return address;
}

export async function readVerdict(contractAddress?: `0x${string}`) {
  const client = getReadClient();
  return client.readContract({
    address: requireContractAddress(contractAddress),
    functionName: 'get_verdict',
    args: [],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });
}

export async function readScore(contractAddress?: `0x${string}`) {
  const client = getReadClient();
  return client.readContract({
    address: requireContractAddress(contractAddress),
    functionName: 'get_score',
    args: [],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });
}
