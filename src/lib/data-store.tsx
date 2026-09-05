import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { uid } from "./id";
import { useAuth } from "./auth";
import { useCreditLedger } from "./credits";
import {
  creditCost,
  type AspectRatio,
  type CreditEntry,
  type CreditReason,
  type DurationSeconds,
  type Generation,
  type Project,
  type VideoStyle,
} from "./types";

/**
 * Local persistence layer standing in for the `projects`, `generations` and
 * `credits` tables. Every mutation below maps 1:1 to a future server call,
 * so no video-provider keys ever need to live in the browser.
 */

interface DataShape {
  projects: Project[];
  generations: Generation[];
  /** Legacy local credit rows. Kept for backwards compatibility only — the
   * authoritative ledger now lives in the database. */
  credits: CreditEntry[];
}

const EMPTY: DataShape = { projects: [], generations: [], credits: [] };

function keyFor(userId: string) {
  return `videaai.data.${userId}`;
}

function load(userId: string): DataShape {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as DataShape) };
  } catch {
    return EMPTY;
  }
}

export interface NewProjectInput {
  prompt: string;
  duration_seconds: DurationSeconds;
  aspect_ratio: AspectRatio;
  style: VideoStyle;
}

export interface JobUpdate {
  status: "queued" | "processing" | "completed" | "failed";
  videoUrl?: string | null;
  error?: string | null;
  /** Verified duration of the finished file, measured server-side. */
  actualDuration?: number | null;
  /** Credits the server says should be returned after a failure. */
  refundCredits?: number;
}

interface DataState extends DataShape {
  ready: boolean;
  /** Authoritative balance from the server ledger. */
  balance: number;
  /** Re-read the server ledger (after a spend, refund or admin adjustment). */
  refreshCredits: () => void;
  createProject: (input: NewProjectInput) => { project: Project; generation: Generation };
  regenerate: (projectId: string) => Generation | undefined;
  addCredits: (amount: number, reason: CreditReason) => void;
  getProject: (id: string) => Project | undefined;
  generationsFor: (projectId: string) => Generation[];
  /** Attach the provider job returned by the server to a local generation row. */
  linkGeneration: (generationId: string, providerJobId: string, provider: string) => void;
  /** Apply a polled provider status to the generation and its project. */
  applyJobUpdate: (generationId: string, update: JobUpdate) => void;
  activeGeneration: (projectId: string) => Generation | undefined;
}

const DataContext = createContext<DataState | null>(null);

function titleFromPrompt(prompt: string) {
  const clean = prompt.trim().replace(/\s+/g, " ");
  if (!clean) return "Untitled project";
  const words = clean.split(" ").slice(0, 6).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Credits are read from the server ledger; the browser never computes or
  // writes an authoritative balance.
  const ledger = useCreditLedger(user?.id ?? null);
  const [data, setData] = useState<DataShape>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setData(EMPTY);
      setReady(false);
      return;
    }
    setData(load(user.id));
    setReady(true);
  }, [user]);

  useEffect(() => {
    if (!user || !ready || typeof window === "undefined") return;
    window.localStorage.setItem(keyFor(user.id), JSON.stringify(data));
  }, [data, user, ready]);

  const balance = ledger.balance;
  const refreshCredits = ledger.refresh;

  const createProject = useCallback(
    (input: NewProjectInput) => {
      const now = new Date().toISOString();
      const userId = user?.id ?? "anonymous";
      const project: Project = {
        id: uid(),
        user_id: userId,
        title: titleFromPrompt(input.prompt),
        prompt: input.prompt.trim(),
        duration_seconds: input.duration_seconds,
        aspect_ratio: input.aspect_ratio,
        style: input.style,
        // Provider is not connected yet: the row is created in a queued state
        // and a server-side worker will move it to ready.
        status: "queued",
        thumbnail_url: null,
        video_url: null,
        actual_duration_seconds: null,
        created_at: now,
        updated_at: now,
      };
      const cost = creditCost(input.duration_seconds);
      const generation: Generation = {
        id: uid(),
        project_id: project.id,
        user_id: userId,
        status: "queued",
        provider: null,
        provider_job_id: null,
        credits_spent: cost,
        error_message: null,
        created_at: now,
        completed_at: null,
      };
      // The debit itself happens server-side inside the generation endpoint.
      setData((prev) => ({
        ...prev,
        projects: [project, ...prev.projects],
        generations: [generation, ...prev.generations],
      }));
      return { project, generation };
    },
    [user],
  );

  const regenerate = useCallback(
    (projectId: string) => {
      const now = new Date().toISOString();
      const userId = user?.id ?? "anonymous";
      const project = data.projects.find((p) => p.id === projectId);
      if (!project) return undefined;
      const cost = creditCost(project.duration_seconds);
      const generation: Generation = {
        id: uid(),
        project_id: projectId,
        user_id: userId,
        status: "queued",
        provider: null,
        provider_job_id: null,
        credits_spent: cost,
        error_message: null,
        created_at: now,
        completed_at: null,
      };
      setData((prev) => ({
        projects: prev.projects.map((p) =>
          p.id === projectId
            ? { ...p, status: "queued", video_url: null, actual_duration_seconds: null, updated_at: now }
            : p,
        ),
        generations: [generation, ...prev.generations],
      }));
      return generation;
    },
    [user, data.projects],
  );

  const linkGeneration = useCallback(
    (generationId: string, providerJobId: string, provider: string) => {
      setData((prev) => ({
        ...prev,
        generations: prev.generations.map((g) =>
          g.id === generationId
            ? { ...g, provider, provider_job_id: providerJobId, status: "processing" }
            : g,
        ),
        projects: prev.projects.map((p) =>
          prev.generations.some((g) => g.id === generationId && g.project_id === p.id)
            ? { ...p, status: "processing", updated_at: new Date().toISOString() }
            : p,
        ),
      }));
    },
    [],
  );

  const applyJobUpdate = useCallback((generationId: string, update: JobUpdate) => {
    const now = new Date().toISOString();
    const projectStatus =
      update.status === "completed"
        ? ("ready" as const)
        : update.status === "failed"
          ? ("failed" as const)
          : update.status === "queued"
            ? ("queued" as const)
            : ("processing" as const);
    setData((prev) => {
      const target = prev.generations.find((g) => g.id === generationId);
      if (!target || target.status === projectStatus) return prev;
      // Refunds are issued server-side; the client only refreshes its view.
      return {
        ...prev,
        generations: prev.generations.map((g) =>
          g.id === generationId
            ? {
                ...g,
                status: projectStatus,
                error_message: update.error ?? null,
                completed_at:
                  update.status === "completed" || update.status === "failed" ? now : null,
              }
            : g,
        ),
        projects: prev.projects.map((p) =>
          p.id === target.project_id
            ? {
                ...p,
                status: projectStatus,
                video_url: update.videoUrl ?? p.video_url,
                actual_duration_seconds:
                  update.actualDuration ?? p.actual_duration_seconds ?? null,
                updated_at: now,
              }
            : p,
        ),
      };
    });
  }, []);

  /**
   * Credits can only be granted server-side (signup bonus, admin adjustment,
   * refund). This just re-reads the authoritative balance.
   */
  const addCredits = useCallback(
    (_amount: number, _reason: CreditReason) => {
      refreshCredits();
    },
    [refreshCredits],
  );

  const getProject = useCallback(
    (id: string) => data.projects.find((p) => p.id === id),
    [data.projects],
  );

  const generationsFor = useCallback(
    (projectId: string) => data.generations.filter((g) => g.project_id === projectId),
    [data.generations],
  );

  const activeGeneration = useCallback(
    (projectId: string) => data.generations.find((g) => g.project_id === projectId),
    [data.generations],
  );

  const value = useMemo(
    () => ({
      ...data,
      credits: ledger.credits,
      ready,
      balance,
      refreshCredits,
      createProject,
      regenerate,
      addCredits,
      getProject,
      generationsFor,
      linkGeneration,
      applyJobUpdate,
      activeGeneration,
    }),
    [
      data,
      ledger.credits,
      ready,
      balance,
      refreshCredits,
      createProject,
      regenerate,
      addCredits,
      getProject,
      generationsFor,
      linkGeneration,
      applyJobUpdate,
      activeGeneration,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
