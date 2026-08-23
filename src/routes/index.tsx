import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Layers, Sparkles, Wand2, Zap } from "lucide-react";
import heroImage from "@/assets/hero.jpg";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { PricingSection } from "@/components/pricing-section";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VideaAI — Turn your ideas into videos" },
      {
        name: "description",
        content:
          "VideaAI generates cinematic AI videos from text prompts. Pick a duration, aspect ratio and style, then create.",
      },
      { property: "og:title", content: "VideaAI — Turn your ideas into videos" },
      {
        property: "og:description",
        content: "Generate AI videos from text prompts in seconds with VideaAI.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Wand2,
    title: "Prompt to video",
    body: "Describe a scene in plain language and get a directed clip with motion, lighting and pacing.",
  },
  {
    icon: Layers,
    title: "Five signature styles",
    body: "Cinematic, Realistic, Anime, 3D and Animation — switch looks without rewriting your prompt.",
  },
  {
    icon: Zap,
    title: "Built for every format",
    body: "Render 9:16, 16:9 or 1:1 at 8, 15 or 30 seconds for any channel you publish to.",
  },
];

function Landing() {
  const { user } = useAuth();
  const primaryTo = user ? "/app/create" : "/signup";

  return (
    <div className="min-h-screen">
      <header className="border-border/60 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Logo />
          <nav className="text-muted-foreground hidden items-center gap-8 text-sm md:flex">
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#pricing" className="hover:text-foreground">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/app">
                <Button size="sm">Open app</Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">
                    Log in
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm">Get started</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="glow-top pointer-events-none absolute inset-x-0 top-0 h-[32rem]" />
          <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-20 text-center sm:pt-24">
            <span className="border-border/70 bg-surface-2 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
              <Sparkles className="text-primary h-3.5 w-3.5" /> AI media creation platform
            </span>
            <h1 className="font-display mx-auto mt-6 max-w-3xl text-4xl leading-tight font-semibold sm:text-6xl">
              Turn your ideas into <span className="text-gradient">videos.</span>
            </h1>
            <p className="text-muted-foreground mx-auto mt-5 max-w-xl text-base sm:text-lg">
              Write a prompt and VideaAI generates a finished AI video — choose the duration, aspect
              ratio and visual style, and share it anywhere.
            </p>
            <div className="mt-8 flex justify-center">
              <Link to={primaryTo}>
                <Button size="lg">
                  Create Video <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="panel mx-auto mt-14 max-w-4xl overflow-hidden p-2">
              <img
                src={heroImage}
                alt="Abstract film strips of teal and gold light representing AI video generation"
                width={1600}
                height={1008}
                className="rounded-lg"
              />
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-center text-3xl font-semibold">Everything you need to ship video</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="panel p-6">
                <span className="bg-primary/12 text-primary grid h-10 w-10 place-items-center rounded-lg">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-4 pb-24">
          <h2 className="text-center text-3xl font-semibold">Simple, credit-based pricing</h2>
          <p className="text-muted-foreground mx-auto mt-3 mb-10 max-w-md text-center text-sm">
            Credits scale with the number of scenes rendered: 1 for 8s, 2 for 15s and 4 for 30s.
          </p>
          <PricingSection />
        </section>
      </main>

      <footer className="border-border/60 border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm sm:flex-row">
          <Logo />
          <p>© {new Date().getFullYear()} VideaAI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
