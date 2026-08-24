/**
 * Server-only credit ledger operations. Regular users can never write to
 * `credit_transactions` (RLS allows inserts only for admins); these helpers run
 * with the service identity from verified server code.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getBalance(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("credit_balance", { _user_id: userId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Debit for a render. `note` carries the job id so refunds stay idempotent. */
export async function spendCredits(userId: string, amount: number, note: string) {
  const { error } = await supabaseAdmin
    .from("credit_transactions")
    .insert({ user_id: userId, amount: -Math.abs(amount), reason: "generation", note });
  if (error) throw new Error(error.message);
}

/** Refund a failed render exactly once, keyed on the job id note. */
export async function refundCredits(userId: string, amount: number, jobId: string) {
  if (amount <= 0) return;
  const note = `refund:${jobId}`;
  const { data: existing } = await supabaseAdmin
    .from("credit_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("note", note)
    .maybeSingle();
  if (existing) return;
  await supabaseAdmin
    .from("credit_transactions")
    .insert({ user_id: userId, amount: Math.abs(amount), reason: "refund", note });
}
