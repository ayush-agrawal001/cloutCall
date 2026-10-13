/** Pure planning for `npm run gas -- --rebalance` (kept separate so it can be unit tested). */
import { parseEther, type Address } from "viem";

export type WalletState = { name: string; address: Address; balance: bigint; target: bigint };
export type Transfer = { from: Address; to: Address; amount: bigint };

/** Gas a donor keeps back per transfer it sends (21k gas at ~120 gwei is ~0.0026 MON). */
export const TRANSFER_FEE = parseEther("0.005");
/** Not worth a transaction below this. */
export const MIN_TRANSFER = parseEther("0.01");

/**
 * Moves MON from wallets above their target to wallets below it. Recipients are served in list order (the
 * caller lists the most important first), each from the donor with the most to spare. No donor ever drops
 * below its own target, and nothing is invented: if donors run out, the rest stays short.
 */
export function planRebalance(wallets: WalletState[]): Transfer[] {
  const spare = new Map(wallets.map((w) => [w.address, w.balance - w.target]));
  const plan: Transfer[] = [];
  for (const r of wallets) {
    let need = r.target - r.balance;
    while (need >= MIN_TRANSFER) {
      const donor = wallets
        .filter((d) => d.address !== r.address && (spare.get(d.address) ?? 0n) - TRANSFER_FEE >= MIN_TRANSFER)
        .sort((a, b) => Number(spare.get(b.address)! - spare.get(a.address)!))[0];
      if (!donor) return plan;
      const can = spare.get(donor.address)! - TRANSFER_FEE;
      const amount = can < need ? can : need;
      plan.push({ from: donor.address, to: r.address, amount });
      spare.set(donor.address, spare.get(donor.address)! - amount - TRANSFER_FEE);
      need -= amount;
    }
  }
  return plan;
}
