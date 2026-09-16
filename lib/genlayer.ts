import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';

export const VERDICTX_CONTRACT = process.env.NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS as `0x${string}` | undefined;
export const ESCROW_CONTRACT = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS as `0x${string}` | undefined;
export const GENLAYER_CHAIN_ID = parseChainId(process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID);
export const GENLAYER_RPC = process.env.NEXT_PUBLIC_GENLAYER_RPC || 'https://studio-next.genlayer.com/api';
export const GENLAYER_EXPLORER = process.env.NEXT_PUBLIC_GENLAYER_EXPLORER || 'https://explorer-studio-dev.genlayer.com';

function parseChainId(value?: string): number { const parsed = value?.trim() ? Number(value.trim()) : 61997; return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 61997; }
const genlayerChain = { ...testnetBradbury, id: GENLAYER_CHAIN_ID, rpcUrls: { ...testnetBradbury.rpcUrls, default: { http: [GENLAYER_RPC] }, public: { http: [GENLAYER_RPC] } }, blockExplorers: { default: { name: 'GenLayer Explorer', url: GENLAYER_EXPLORER } } };

export function getReadClient() { return createClient({ chain: genlayerChain }); }

function requireContractAddress(contractAddress?: `0x${string}`) {
  const address = contractAddress ?? VERDICTX_CONTRACT;
  if (!address || address === '0x0000000000000000000000000000000000000000') throw new Error('NEXT_PUBLIC_VERDICTX_CONTRACT_ADDRESS is not configured');
  return address;
}

export async function readVerdict(contractAddress?: `0x${string}`) {
  return getReadClient().readContract({ address: requireContractAddress(contractAddress), functionName: 'get_verdict', args: [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
}

export async function readScore(contractAddress?: `0x${string}`) {
  return getReadClient().readContract({ address: requireContractAddress(contractAddress), functionName: 'get_score', args: [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
}

export async function readEscrowState(contractAddress?: `0x${string}`) {
  const address = contractAddress ?? ESCROW_CONTRACT;
  if (!address || address === '0x0000000000000000000000000000000000000000') throw new Error('NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS is not configured');
  const client = getReadClient();
  const [finalized, blocked, settled, percentage] = await Promise.all([
    client.readContract({ address, functionName: 'is_verdict_finalized', args: [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL }),
    client.readContract({ address, functionName: 'is_settlement_blocked', args: [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL }),
    client.readContract({ address, functionName: 'is_settled', args: [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL }),
    client.readContract({ address, functionName: 'get_payment_percentage', args: [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL }),
  ]);
  return { verdictFinalized: Boolean(finalized), settlementBlocked: Boolean(blocked), settled: Boolean(settled), paymentPercentage: Number(percentage) };
}
