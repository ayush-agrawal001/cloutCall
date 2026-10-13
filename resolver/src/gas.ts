/**
 * Gas for CloutCall's own wallets: see where the MON is, move it to the wallet that needs it, and open the
 * faucets for a manual top-up. Faucets are claimed by hand: they're CAPTCHA- and login-gated and don't allow
 * automated claims.
 *
 *   npm run gas                         # balances vs targets
 *   npm run gas -- --rebalance          # plan transfers from wallets over target to wallets under it
 *   npm run gas -- --rebalance --send   # ...and send them
 *   npm run gas -- --faucet             # open the faucet pages with the address that needs MON most
 */
import { execFile } from "node:child_process";
import { parseArgs } from "node:util";
import { createWalletClient, formatEther, http, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { load } from "./config";
import { botKey } from "./liquidity-logic";
import { planRebalance, type WalletState } from "./gas-logic";

const { values } = parseArgs({
  options: {
    rebalance: { type: "boolean", default: false },
    send: { type: "boolean", default: false },
    faucet: { type: "boolean", default: false },
    bots: { type: "string", default: "4" },
    // MON each role should hold: about 2–4 hours of its usual spend, see the role notes below.
    keeper: { type: "string", default: "2" },
    agent: { type: "string", default: "1" },
    drip: { type: "string", default: "0.5" },
    bot: { type: "string", default: "0.15" },
  },
});

const FAUCETS = [
  "https://faucet.monad.xyz",
  "https://ethglobal.com/faucet/monad-testnet-10143",
  "https://web3.okx.com/faucet/monad/66",
];

const cfg = load();
const rpc = (cfg.publicClient.transport as { url?: string }).url;

type Wallet = WalletState & { key: Hex; note: string };
const wallets: Wallet[] = [];
const add = (name: string, key: string | undefined, target: string, note: string) => {
  if (!key) return;
  const address = privateKeyToAccount(key as Hex).address;
  if (wallets.some((w) => w.address === address)) return; // deployer and resolver may be the same key
  wallets.push({ name, address, key: key as Hex, balance: 0n, target: parseEther(target), note });
};
add(
  "keeper",
  process.env.RESOLVER_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY,
  values.keeper!,
  "opens + settles sprints, ~0.4 MON/h at 15",
);
add("cloutbot", process.env.AGENT_PRIVATE_KEY, values.agent!, "≤8 picks/h × ~0.03 MON");
add("drip", process.env.DRIP_PRIVATE_KEY, values.drip!, "gas for new players, 0.2 MON each");
if (process.env.BOTS_SEED) {
  for (let i = 0; i < Number(values.bots); i++) {
    add(`bot ${i + 1}`, botKey(process.env.BOTS_SEED as Hex, i), values.bot!, "liquidity bot, ~0.01 MON a call");
  }
}

for (const w of wallets) w.balance = await cfg.publicClient.getBalance({ address: w.address });

const fmt = (v: bigint) => Number(formatEther(v)).toFixed(3).padStart(8);
console.log(`Wallets on chain ${cfg.chainId}\n`);
for (const w of wallets) {
  const flag = w.balance < w.target ? (w.balance < w.target / 4n ? "LOW " : "under") : "ok   ";
  console.log(`  ${flag} ${w.name.padEnd(9)} ${w.address}  ${fmt(w.balance)} / ${fmt(w.target)} MON   ${w.note}`);
}
const total = wallets.reduce((s, w) => s + w.balance, 0n);
const wanted = wallets.reduce((s, w) => s + w.target, 0n);
console.log(
  `\n  total ${formatEther(total)} MON across ${wallets.length} wallets; targets add up to ${formatEther(wanted)} MON`,
);

if (values.rebalance) {
  const plan = planRebalance(wallets);
  if (plan.length === 0) {
    console.log("\nNothing to move: every wallet is at target, or no wallet has MON to spare.");
  } else {
    console.log(`\n${values.send ? "Sending" : "Plan (add --send to execute)"}:`);
    for (const t of plan) {
      const from = wallets.find((w) => w.address === t.from)!;
      const to = wallets.find((w) => w.address === t.to)!;
      console.log(`  ${from.name} → ${to.name}: ${formatEther(t.amount)} MON`);
      if (!values.send) continue;
      const client = createWalletClient({
        account: privateKeyToAccount(from.key),
        chain: cfg.chain,
        transport: http(rpc),
      });
      // Monad charges the gas limit, so set it exactly for a plain transfer.
      const hash = await client.sendTransaction({ to: to.address, value: t.amount, gas: 21_000n });
      await cfg.publicClient.waitForTransactionReceipt({ hash });
      console.log(`    done (${hash})`);
    }
  }
  const short = wanted > total ? wanted - total : 0n;
  if (short > 0n)
    console.log(
      `\nAll wallets together are ${formatEther(short)} MON short of their targets: claim from a faucet (--faucet).`,
    );
}

if (values.faucet) {
  const neediest = [...wallets].sort((a, b) => Number(a.balance - a.target - (b.balance - b.target)))[0];
  console.log(`\nClaim testnet MON by hand (CAPTCHA / login) for: ${neediest?.address as Address}\n`);
  for (const url of FAUCETS) {
    console.log(`  ${url}`);
    execFile(process.platform === "darwin" ? "open" : "xdg-open", [url], () => {});
  }
  console.log("\nThen run `npm run gas -- --rebalance --send` to spread it to the other wallets.");
}
