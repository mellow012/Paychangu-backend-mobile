import { Contract, JsonRpcProvider, Wallet } from "ethers";

/**
 * Server-side Arbiter. The Arbiter private key lives ONLY in a Vercel env var
 * (ARBITER_PRIVATE_KEY, marked Sensitive); it is never sent to the phones.
 *
 * Env: RPC_URL (Sepolia), ESCROW_CONTRACT, ARBITER_PRIVATE_KEY
 */
const ABI = [
  "function resolveDispute(bytes32 id, bool releaseToSeller)",
  "function statusOf(bytes32 id) view returns (uint8)",
];

/** Matches the contract's Status enum. */
export const CHAIN_STATUS = { Funded: 3, Delivered: 4, Completed: 5, Refunded: 6, Disputed: 8 } as const;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v.trim();
}

function contract(withSigner: boolean) {
  const provider = new JsonRpcProvider(env("RPC_URL"));
  const signer = withSigner ? new Wallet(env("ARBITER_PRIVATE_KEY"), provider) : provider;
  return new Contract(env("ESCROW_CONTRACT"), ABI, signer);
}

export async function chainStatusOf(blockchainTradeId: string): Promise<number> {
  return Number(await contract(false).statusOf(blockchainTradeId));
}

/** Sends resolveDispute and waits for it to be mined. Returns the tx hash. */
export async function resolveOnChain(blockchainTradeId: string, releaseToSeller: boolean): Promise<string> {
  const c = contract(true);
  const tx = await c.resolveDispute(blockchainTradeId, releaseToSeller);
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) throw new Error("resolveDispute transaction failed");
  return tx.hash as string;
}
