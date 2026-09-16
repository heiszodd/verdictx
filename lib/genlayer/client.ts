import { createGenLayerClient, createWalletClient, http, type Account, type GenLayerClient } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { encodeFunctionData, type Address, type Hex } from 'viem';
import { getInjectedProvider } from './wallet';
import { VERDICTX_ABI } from './abi';

type ClientAccount = `0x${string}`;
type VerdictXTransaction = { hash: Hex };
type WalletAccount = { address: ClientAccount; type: 'json-rpc' };

const STUDIO_DEV_RPC = 'https://studio-dev.genlayer.com/api';
const STUDIO_DEV_CHAIN_ID = 61997;

function normalizeAddress(address: string): ClientAccount {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`Invalid wallet address: ${address}`);
  }
  return address as ClientAccount;
}

function walletAccount(address: ClientAccount): WalletAccount {
  return { address, type: 'json-rpc' };
}

function requireAddress(value: unknown, label: string): ClientAccount {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${label} is invalid: ${String(value)}`);
  }
  return value as ClientAccount;
}

function getVerdictXContractAddress(): ClientAccount {
  const address = process.env.NEXT_PUBLIC_VERDICTX_ADDRESS;
  return requireAddress(address, 'VerdictX contract address');
}

async function getProvider() {
  const provider = await getInjectedProvider();
  if (!provider) throw new Error('No injected wallet provider found');
  return provider;
}

async function getGenLayerClient(): Promise<GenLayerClient> {
  const provider = await getProvider();
  const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
  const account = normalizeAddress(accounts[0]);

  return createGenLayerClient({
    chain: studioDevnet,
    transport: http(STUDIO_DEV_RPC),
    account: walletAccount(account) as Account,
  });
}

export async function getConnectedAccount(): Promise<ClientAccount> {
  const provider = await getProvider();
  const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
  if (!accounts[0]) throw new Error('No connected wallet account');
  return normalizeAddress(accounts[0]);
}

export async function deployVerdictXCase(
  account: string,
  bytecode: Hex,
  args: readonly unknown[] = [],
): Promise<VerdictXTransaction> {
  const client = await getGenLayerClient();
  const sender = normalizeAddress(account);
  return await client.deployContract({
    account: walletAccount(sender),
    bytecode,
    abi: VERDICTX_ABI,
    args,
  }) as VerdictXTransaction;
}

export async function readVerdictX<T = unknown>(
  functionName: string,
  args: readonly unknown[] = [],
): Promise<T> {
  const client = await getGenLayerClient();
  const address = getVerdictXContractAddress();
  return await client.readContract({
    address,
    abi: VERDICTX_ABI,
    functionName,
    args,
  }) as T;
}

async function estimateAdjudicationFees(
  client: GenLayerClient,
  write: {
    address: ClientAccount;
    functionName: string;
    args?: unknown[];
    value?: bigint;
  },
) {
  // Let genlayer-js simulate the exact write and derive the internal-message
  // allocation itself. Do not manually construct messageAllocations or budget
  // values: adjudicate creates a finalized internal message whose actual GenVM
  // accounting must come from the simulator.
  return client.estimateTransactionFeesForWrite({
    ...write,
    executionHeadroomBps: 12_000n,
    messageHeadroomBps: 12_000n,
  } as never);
}

export async function submitAdjudication(
  account: string,
  caseId: string,
): Promise<VerdictXTransaction> {
  const client = await getGenLayerClient();
  const sender = normalizeAddress(account);
  const address = getVerdictXContractAddress();

  const write = {
    address,
    functionName: 'adjudicate',
    args: [caseId],
    value: 0n,
  };

  const fees = await estimateAdjudicationFees(client, write);

  return await client.writeContract({
    account: walletAccount(sender),
    ...write,
    fees,
  }) as VerdictXTransaction;
}

export async function getVerdictXEscrow(): Promise<ClientAccount> {
  const client = await getGenLayerClient();
  const address = getVerdictXContractAddress();
  const deployedEscrow = String(await client.readContract({
    address,
    abi: VERDICTX_ABI,
    functionName: 'get_escrow',
    args: [],
  }));
  return requireAddress(deployedEscrow, 'VerdictX escrow address');
}

export { STUDIO_DEV_CHAIN_ID };
