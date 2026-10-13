import { AGENT_ADDRESS, JOURNAL_ADDRESS } from "./chain";

/** Plain constants (no "use client"), so server components can read them too. */
export const AI_ENABLED = !!(JOURNAL_ADDRESS && AGENT_ADDRESS);
export const AI_NAME = "CloutBot";
