import type { Address } from "viem";

/** Message a passkey account signs to ask for its YouTube channel to be linked. Shared by client and server. */
export const LINK_MESSAGE_PREFIX = "CloutCall: link my YouTube channel to ";

export function linkMessage(address: Address, issuedAt: string, nonce: string) {
  return `${LINK_MESSAGE_PREFIX}${address}\nIssued: ${issuedAt}\nNonce: ${nonce}`;
}
