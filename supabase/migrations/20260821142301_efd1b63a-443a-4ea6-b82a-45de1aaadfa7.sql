CREATE TABLE public.video_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_ref TEXT NOT NULL,
  project_ref TEXT NOT NULL,
  prompt TEXT NOT NULL,
  requested_duration INTEGER NOT NULL,
  aspect_ratio TEXT NOT NULL,
  style TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  phase TEXT NOT NULL DEFAULT 'planning',
  progress INTEGER NOT NULL DEFAULT 0,
  continuity_bible TEXT,
  scenes JSONB NOT NULL DEFAULT '[]'::jsonb,
  failed_scene INTEGER,
  error_message TEXT,
  credits_spent INTEGER NOT NULL DEFAULT 0,
  final_path TEXT,
  actual_duration_seconds NUMERIC,
  width INTEGER,
  height INTEGER,
  fps NUMERIC,
  video_codec TEXT,
  audio_codec TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.video_jobs TO service_role;

ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX video_jobs_user_project_idx ON public.video_jobs (user_ref, project_ref);

CREATE OR REPLACE FUNCTION public.touch_video_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER video_jobs_updated_at
BEFORE UPDATE ON public.video_jobs
FOR EACH ROW EXECUTE FUNCTION public.touch_video_jobs_updated_at();