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
import {
  CREDIT_COST,
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
}

interface DataState extends DataShape {
  ready: boolean;
  balance: number;
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
  const [data, setData] = useState<DataShape>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setData(EMPTY);
      setReady(false);
      return;
    }
    const loaded = load(user.id);
    if (loaded.credits.length === 0) {
      loaded.credits = [
        {
          id: uid(),
          user_id: user.id,
          amount: 25,
          reason: "signup_bonus",
          created_at: new Date().toISOString(),
        },
      ];
    }
    setData(loaded);
    setReady(true);
  }, [user]);

  useEffect(() => {
    if (!user || !ready || typeof window === "undefined") return;
    window.localStorage.setItem(keyFor(user.id), JSON.stringify(data));
  }, [data, user, ready]);

  const balance = useMemo(
    () => data.credits.reduce((sum, entry) => sum + entry.amount, 0),
    [data.credits],
  );

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
        created_at: now,
        updated_at: now,
      };
      const cost = CREDIT_COST[input.duration_seconds];
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
      setData((prev) => ({
        projects: [project, ...prev.projects],
        generations: [generation, ...prev.generations],
        credits: [
          {
            id: uid(),
            user_id: userId,
            amount: -cost,
            reason: "generation",
            created_at: now,
          },
          ...prev.credits,
        ],
      }));
      return project;
    },
    [user],
  );

  const regenerate = useCallback(
    (projectId: string) => {
      const now = new Date().toISOString();
      const userId = user?.id ?? "anonymous";
      const project = data.projects.find((p) => p.id === projectId);
      if (!project) return undefined;
      const cost = CREDIT_COST[project.duration_seconds];
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
            ? { ...p, status: "queued", video_url: null, updated_at: now }
            : p,
        ),
        generations: [generation, ...prev.generations],
        credits: [
          { id: uid(), user_id: userId, amount: -cost, reason: "generation", created_at: now },
          ...prev.credits,
        ],
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
      const refund =
        update.status === "failed" && target.status !== "failed"
          ? [
              {
                id: uid(),
                user_id: target.user_id,
                amount: target.credits_spent,
                reason: "refund" as CreditReason,
                created_at: now,
              },
            ]
          : [];
      return {
        credits: [...refund, ...prev.credits],
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
                updated_at: now,
              }
            : p,
        ),
      };
    });
  }, []);

  const addCredits = useCallback(
    (amount: number, reason: CreditReason) => {
      setData((prev) => ({
        ...prev,
        credits: [
          {
            id: uid(),
            user_id: user?.id ?? "anonymous",
            amount,
            reason,
            created_at: new Date().toISOString(),
          },
          ...prev.credits,
        ],
      }));
    },
    [user],
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
      ready,
      balance,
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
      ready,
      balance,
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
