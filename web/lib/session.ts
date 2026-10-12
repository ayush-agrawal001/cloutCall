"use client";

import type { Secp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { createWalletClient, http, type Abi, type Address } from "viem";
import { chain, MARKET_ADDRESS, POINTS_ADDRESS, REGISTRY_ADDRESS, RPC_URL } from "./chain";
import { FastSender, type FastReceipt } from "./tx";
import { LINK_MESSAGE_PREFIX } from "./creatorLink";

/**
 * A clearly scoped mera signing session.
 *
 * After one passkey prompt the session signs without further prompts, but only:
 *   - transactions to the CloutCall contracts (never value transfers, never other contracts),
 *   - up to a points budget at risk, and
 *   - for a limited time.
 * Anything outside that scope throws `SessionScopeError`, and the UI asks for the passkey again,
 * which opens a fresh session. Ending the session zeroes the key in memory.
 */
export const SESSION_BUDGET = 1_000;
export const SESSION_TTL_MS = 30 * 60 * 1000;

export class SessionScopeError extends Error {
  constructor(
    public reason: "expired" | "budget" | "target",
    message: string,
  ) {
    super(message);
  }
}

export type SessionInfo = { address: Address; expiresAt: number; budget: number; spent: number };

export class ScopedSession {
  readonly address: Address;
  readonly expiresAt: number;
  readonly budget: number;
  spent = 0;
  private readonly allowed: Set<string>;
  private readonly sender: FastSender;
  private readonly account: ReturnType<typeof toViemAccount>;
  private ended = false;

  constructor(
    private readonly mera: Secp256k1SigningSession,
    opts: { budget?: number; ttlMs?: number } = {},
  ) {
    const account = toViemAccount(mera);
    this.account = account;
    this.address = account.address;
    this.budget = opts.budget ?? SESSION_BUDGET;
    this.expiresAt = Date.now() + (opts.ttlMs ?? SESSION_TTL_MS);
    this.allowed = new Set(
      [MARKET_ADDRESS, POINTS_ADDRESS, REGISTRY_ADDRESS].filter((a): a is Address => !!a).map((a) => a.toLowerCase()),
    );
    this.sender = new FastSender(account, createWalletClient({ account, chain, transport: http(RPC_URL) }));
  }

  get active() {
    return !this.ended && Date.now() < this.expiresAt;
  }

  info(): SessionInfo {
    return { address: this.address, expiresAt: this.expiresAt, budget: this.budget, spent: this.spent };
  }

  /** Signs and sends without a prompt if the call is inside the session scope. */
  async write<const abi extends Abi>(
    req: { address: Address; abi: abi; functionName: string; args: readonly unknown[] },
    pointsAtRisk = 0,
  ): Promise<FastReceipt> {
    if (!this.active) throw new SessionScopeError("expired", "Session expired — confirm with your passkey.");
    if (!this.allowed.has(req.address.toLowerCase())) {
      throw new SessionScopeError("target", "This session can only talk to CloutCall contracts.");
    }
    if (this.spent + pointsAtRisk > this.budget) {
      throw new SessionScopeError(
        "budget",
        `This call goes over your ${this.budget}-point session limit — confirm with your passkey.`,
      );
    }
    const res = await this.sender.write(
      req as { address: Address; abi: Abi; functionName: string; args: readonly unknown[] },
    );
    this.spent += pointsAtRisk;
    return res;
  }

  /**
   * Signs a creator-link message (proves this account asked to be linked to a channel). The session refuses
   * to sign any other kind of message.
   */
  async signLinkMessage(message: string) {
    if (!this.active) throw new SessionScopeError("expired", "Session expired — confirm with your passkey.");
    if (!message.startsWith(LINK_MESSAGE_PREFIX)) {
      throw new SessionScopeError("target", "This session only signs CloutCall creator-link messages.");
    }
    return this.account.signMessage({ message });
  }

  /** Warm up a call that is about to happen (no signing, no state change). */
  prefetch(req: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] }) {
    if (!this.active || !this.allowed.has(req.address.toLowerCase())) return;
    this.sender.prefetch(req).catch(() => {});
  }

  end() {
    if (this.ended) return;
    this.ended = true;
    this.sender.stop();
    this.mera.end();
  }
}
