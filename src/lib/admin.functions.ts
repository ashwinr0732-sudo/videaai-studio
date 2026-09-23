/**
 * Admin-only server functions.
 *
 * Every function verifies the caller's admin role server-side through the
 * database `has_role` check before touching privileged data. A browser-side
 * `isAdmin` flag is only used to hide UI; it is never the security boundary.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string | null;
  plan: string;
  created_at: string;
  balance: number;
  generations: number;
  failed: number;
  role: "admin" | "user";
}

export interface AdminJobRow {
  id: string;
  user_ref: string;
  email: string | null;
  project_ref: string;
  prompt: string;
  status: string;
  phase: string;
  progress: number;
  requested_duration: number;
  actual_duration_seconds: number | null;
  aspect_ratio: string;
  style: string;
  credits_spent: number;
  error_message: string | null;
  failed_scene: number | null;
  created_at: string;
  updated_at: string;
}

export interface AdminTxRow {
  id: string;
  user_id: string;
  email: string | null;
  amount: number;
  reason: string;
  note: string | null;
  admin_id: string | null;
  admin_email: string | null;
  created_at: string;
}

export interface AdminOverview {
  totalUsers: number;
  activeUsers: number;
  admins: number;
  totalGenerations: number;
  completed: number;
  failed: number;
  running: number;
  creditsConsumed: number;
  creditsGranted: number;
  creditsOutstanding: number;
  planCounts: Record<string, number>;
  recentErrors: { id: string; message: string; created_at: string; email: string | null }[];
  recentActivity: {
    id: string;
    action: string;
    details: Record<string, unknown>;
    created_at: string;
    admin_email: string | null;
  }[];
}

/** Throws unless the verified caller holds the `admin` role in the database. */
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Could not verify your permissions.");
  if (!data) throw new Error("Forbidden: admin access required.");
  return context.userId;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function emailMap(db: any, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const { data } = await db.from("profiles").select("id, email").in("id", unique);
  return new Map<string, string>((data ?? []).map((r: any) => [r.id, r.email]));
}

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverview> => {
    await assertAdmin(context as any);
    const db = await admin();

    const [profiles, roles, jobs, tx, audit] = await Promise.all([
      db.from("profiles").select("id, plan, created_at"),
      db.from("user_roles").select("user_id, role"),
      db.from("video_jobs").select("id, user_ref, status, error_message, created_at"),
      db.from("credit_transactions").select("amount, reason"),
      db
        .from("admin_audit_log")
        .select("id, action, details, created_at, admin_id")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    const jobRows = (jobs.data ?? []) as any[];
    const txRows = (tx.data ?? []) as any[];
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const planCounts: Record<string, number> = {};
    for (const p of (profiles.data ?? []) as any[]) {
      planCounts[p.plan] = (planCounts[p.plan] ?? 0) + 1;
    }

    const failedJobs = jobRows.filter((j) => j.status === "failed");
    const errorEmails = await emailMap(db, failedJobs.slice(0, 10).map((j) => j.user_ref));
    const auditEmails = await emailMap(
      db,
      ((audit.data ?? []) as any[]).map((a) => a.admin_id),
    );

    const consumed = txRows
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const granted = txRows.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);

    return {
      totalUsers: (profiles.data ?? []).length,
      activeUsers: new Set(
        jobRows.filter((j) => new Date(j.created_at).getTime() > since).map((j) => j.user_ref),
      ).size,
      admins: ((roles.data ?? []) as any[]).filter((r) => r.role === "admin").length,
      totalGenerations: jobRows.length,
      completed: jobRows.filter((j) => j.status === "completed").length,
      failed: failedJobs.length,
      running: jobRows.filter((j) => j.status === "queued" || j.status === "processing").length,
      creditsConsumed: consumed,
      creditsGranted: granted,
      creditsOutstanding: granted - consumed,
      planCounts,
      recentErrors: failedJobs
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 10)
        .map((j) => ({
          id: j.id,
          message: j.error_message ?? "Unknown provider error",
          created_at: j.created_at,
          email: errorEmails.get(j.user_ref) ?? null,
        })),
      recentActivity: ((audit.data ?? []) as any[]).map((a) => ({
        id: a.id,
        action: a.action,
        details: a.details ?? {},
        created_at: a.created_at,
        admin_email: auditEmails.get(a.admin_id) ?? null,
      })),
    };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string }) => ({ search: (input?.search ?? "").trim() }))
  .handler(async ({ data, context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context as any);
    const db = await admin();

    let query = db
      .from("profiles")
      .select("id, email, full_name, plan, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.search) {
      const safe = data.search.replace(/[%,()]/g, "");
      query = query.or(`email.ilike.%${safe}%,full_name.ilike.%${safe}%`);
    }

    const [{ data: profiles }, { data: tx }, { data: jobs }, { data: roles }] = await Promise.all([
      query,
      db.from("credit_transactions").select("user_id, amount"),
      db.from("video_jobs").select("user_ref, status"),
      db.from("user_roles").select("user_id, role"),
    ]);

    const balances = new Map<string, number>();
    for (const t of (tx ?? []) as any[]) {
      balances.set(t.user_id, (balances.get(t.user_id) ?? 0) + t.amount);
    }
    const counts = new Map<string, { total: number; failed: number }>();
    for (const j of (jobs ?? []) as any[]) {
      const c = counts.get(j.user_ref) ?? { total: 0, failed: 0 };
      c.total += 1;
      if (j.status === "failed") c.failed += 1;
      counts.set(j.user_ref, c);
    }
    const adminIds = new Set(
      ((roles ?? []) as any[]).filter((r) => r.role === "admin").map((r) => r.user_id),
    );

    return ((profiles ?? []) as any[]).map((p) => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      plan: p.plan,
      created_at: p.created_at,
      balance: balances.get(p.id) ?? 0,
      generations: counts.get(p.id)?.total ?? 0,
      failed: counts.get(p.id)?.failed ?? 0,
      role: adminIds.has(p.id) ? ("admin" as const) : ("user" as const),
    }));
  });

export const adminUserDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => ({ userId: String(input.userId) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const db = await admin();

    const [{ data: profile }, { data: tx }, { data: jobs }, { data: roles }] = await Promise.all([
      db.from("profiles").select("*").eq("id", data.userId).maybeSingle(),
      db
        .from("credit_transactions")
        .select("*")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("video_jobs")
        .select("*")
        .eq("user_ref", data.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      db.from("user_roles").select("role").eq("user_id", data.userId),
    ]);

    const balance = ((tx ?? []) as any[]).reduce((s, t) => s + t.amount, 0);
    return {
      profile: profile as any,
      balance,
      role: ((roles ?? []) as any[]).some((r) => r.role === "admin") ? "admin" : "user",
      transactions: (tx ?? []) as any[],
      jobs: (jobs ?? []) as any[],
    };
  });

export const adminListJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: string }) => ({ status: input?.status ?? "all" }))
  .handler(async ({ data, context }): Promise<AdminJobRow[]> => {
    await assertAdmin(context as any);
    const db = await admin();

    let query = db
      .from("video_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);

    const { data: jobs } = await query;
    const rows = (jobs ?? []) as any[];
    const emails = await emailMap(db, rows.map((j) => j.user_ref));

    return rows.map((j) => ({
      id: j.id,
      user_ref: j.user_ref,
      email: emails.get(j.user_ref) ?? null,
      project_ref: j.project_ref,
      prompt: j.prompt,
      status: j.status,
      phase: j.phase,
      progress: j.progress,
      requested_duration: j.requested_duration,
      actual_duration_seconds: j.actual_duration_seconds,
      aspect_ratio: j.aspect_ratio,
      style: j.style,
      credits_spent: j.credits_spent,
      error_message: j.error_message,
      failed_scene: j.failed_scene,
      created_at: j.created_at,
      updated_at: j.updated_at,
    }));
  });

export const adminListTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminTxRow[]> => {
    await assertAdmin(context as any);
    const db = await admin();

    const { data: tx } = await db
      .from("credit_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(150);
    const rows = (tx ?? []) as any[];
    const emails = await emailMap(db, [
      ...rows.map((t) => t.user_id),
      ...rows.map((t) => t.admin_id).filter(Boolean),
    ]);

    return rows.map((t) => ({
      id: t.id,
      user_id: t.user_id,
      email: emails.get(t.user_id) ?? null,
      amount: t.amount,
      reason: t.reason,
      note: t.note,
      admin_id: t.admin_id,
      admin_email: t.admin_id ? (emails.get(t.admin_id) ?? null) : null,
      created_at: t.created_at,
    }));
  });

/** Manual credit adjustment. The database re-checks the admin role itself. */
export const adminAdjustCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; amount: number; reason: string }) => {
    const amount = Math.trunc(Number(input.amount));
    if (!input.userId) throw new Error("A user must be selected.");
    if (!Number.isFinite(amount) || amount === 0) throw new Error("Enter a non-zero amount.");
    if (Math.abs(amount) > 100000) throw new Error("Amount is too large.");
    const reason = String(input.reason ?? "").trim().slice(0, 200);
    if (!reason) throw new Error("A reason is required for the audit trail.");
    return { userId: String(input.userId), amount, reason };
  })
  .handler(async ({ data, context }) => {
    const adminId = await assertAdmin(context as any);
    const db = await admin();

    const { data: balance, error } = await db.rpc("admin_adjust_credits" as never, {
      _admin_id: adminId,
      _user_id: data.userId,
      _amount: data.amount,
      _note: `admin:${Date.now()}:${data.reason}`,
    } as never);
    if (error) {
      if (error.message.includes("insufficient_credits"))
        throw new Error("That would push the balance below zero.");
      if (error.message.includes("not_admin")) throw new Error("Forbidden: admin access required.");
      throw new Error(error.message);
    }

    await db.from("admin_audit_log").insert({
      admin_id: adminId,
      action: data.amount > 0 ? "credits.add" : "credits.remove",
      target_user_id: data.userId,
      details: { amount: data.amount, reason: data.reason },
    });

    return { balance: Number(balance ?? 0) };
  });
