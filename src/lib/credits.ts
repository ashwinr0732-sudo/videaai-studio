import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CreditEntry, CreditReason } from "./types";

/**
 * Credits are an append-only server ledger. The browser can only READ its own
 * rows (RLS); every write happens server-side with an admin or system identity.
 */
export function useCreditLedger(userId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["credits", userId],
    enabled: Boolean(userId),
    staleTime: 10_000,
    queryFn: async (): Promise<CreditEntry[]> => {
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("id, user_id, amount, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id,
        user_id: row.user_id,
        amount: row.amount,
        reason: row.reason as CreditReason,
        created_at: row.created_at,
      }));
    },
  });

  const credits = query.data ?? [];
  const balance = credits.reduce((sum, entry) => sum + entry.amount, 0);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["credits", userId] });
  }, [queryClient, userId]);

  return { credits, balance, loading: query.isLoading, refresh };
}
