/**
 * Server-only credit ledger operations.
 *
 * The database is the source of truth: balances are derived from the append-only
 * `credit_transactions` ledger, and every mutation goes through a SECURITY
 * DEFINER function that takes a per-user advisory lock, so two concurrent
 * renders can never spend the same credits twice. Regular users hold no write
 * privileges on the ledger and cannot execute these functions directly.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export class InsufficientCreditsError extends Error {
  constructor(public readonly cost: number) {
    super(`Not enough credits. This render costs ${cost}.`);
  }
}

export async function getBalance(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("credit_balance", { _user_id: userId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/**
 * Atomically debit for a render. `note` is derived from the job id so a retried
 * request charges at most once. Throws InsufficientCreditsError when short.
 */
export async function spendCredits(userId: string, amount: number, jobId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("spend_credits" as never, {
    _user_id: userId,
    _amount: Math.abs(amount),
    _note: `spend:${jobId}`,
  } as never);
  if (error) {
    if (error.message.includes("insufficient_credits")) throw new InsufficientCreditsError(amount);
    throw new Error(error.message);
  }
  return Number(data ?? 0);
}

/** Refund a failed render exactly once, keyed on the job id. */
export async function refundCredits(userId: string, amount: number, jobId: string): Promise<void> {
  if (amount <= 0) return;
  const { error } = await supabaseAdmin.rpc("refund_credits" as never, {
    _user_id: userId,
    _amount: Math.abs(amount),
    _note: `refund:${jobId}`,
  } as never);
  if (error) throw new Error(error.message);
}
