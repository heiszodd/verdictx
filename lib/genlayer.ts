import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';

export const VERDICTX_CONTRACT = process.env.NEXT_PUBLIC_VERDICTX_CONTRACT as `0x${string}` | undefined;

export function getReadClient() {
  return createClient({ chain: testnetBradbury });
}

export async function readVerdict(contractAddress: `0x${string}` = VERDICTX_CONTRACT!) {
  if (!contractAddress) throw new Error('NEXT_PUBLIC_VERDICTX_CONTRACT is not configured');
  const client = getReadClient();
  return client.readContract({ address: contractAddress, functionName: 'get_verdict', args: [] });
}

export async function readScore(contractAddress: `0x${string}` = VERDICTX_CONTRACT!) {
  if (!contractAddress) throw new Error('NEXT_PUBLIC_VERDICTX_CONTRACT is not configured');
  const client = getReadClient();
  return client.readContract({ address: contractAddress, functionName: 'get_score', args: [] });
}
