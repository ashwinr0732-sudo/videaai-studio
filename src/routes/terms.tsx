import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="relative min-h-screen px-4 py-12">
      <div className="glow-top pointer-events-none absolute inset-x-0 top-0 h-96" />

      <main className="relative mx-auto w-full max-w-4xl">
        <div className="panel p-8">
          <Logo className="mb-8" />

          <h1 className="text-3xl font-semibold">
            VideaAI Terms & Conditions
          </h1>

          <p className="text-muted-foreground mt-2 text-sm">
            Effective Date: October 10, 2026
          </p>

          <div className="mt-8 space-y-6 text-sm leading-7">
            <p>
              Welcome to VideaAI. VideaAI is an AI-powered video generation
              platform that provides tools for creating videos using artificial
              intelligence.
            </p>

            <p>
              By creating an account, accessing, or using VideaAI, you confirm
              that you have read, understood, and agreed to these Terms &
              Conditions.
            </p>

            <p className="font-medium">
              If you do not agree with these Terms, you must not use VideaAI.
            </p>

            <h2 className="text-xl font-semibold">1. About VideaAI</h2>

            <p>
              VideaAI provides AI-powered video generation tools. You are
              responsible for your use of the service and for the content you
              create, upload, download, publish, distribute, or otherwise use
              through VideaAI.
            </p>

            <h2 className="text-xl font-semibold">
              2. Your Responsibility
            </h2>

            <p>
              AI-generated results may be unpredictable, inaccurate,
              incomplete, or different from what you requested. You are
              responsible for reviewing generated content before using,
              publishing, distributing, or commercially exploiting it.
            </p>

            <p className="font-medium">
              You use VideaAI and its generated outputs at your own
              responsibility and risk.
            </p>

            <h2 className="text-xl font-semibold">3. User Content</h2>

            <p>
              You represent that you have the necessary rights, permissions,
              licenses, or authority to use and submit content to VideaAI.
              You remain responsible for ensuring that your uploaded material
              does not violate the rights of another person or organization.
            </p>

            <h2 className="text-xl font-semibold">4. Prohibited Uses</h2>

            <p>
              You must not use VideaAI for unlawful, fraudulent, abusive,
              harmful, or malicious purposes, or to violate another person's
              rights or applicable law.
            </p>

            <h2 className="text-xl font-semibold">5. Service Availability</h2>

            <p>
              VideaAI does not guarantee uninterrupted availability. The
              service may become temporarily unavailable because of maintenance,
              technical failures, infrastructure problems, AI provider
              outages, network problems, security incidents, or other events
              outside our reasonable control.
            </p>

            <h2 className="text-xl font-semibold">6. Privacy</h2>

            <p>
              VideaAI may store basic account information required to operate
              and secure your account. Please refer to the VideaAI Privacy
              Policy for information about data handling.
            </p>

            <h2 className="text-xl font-semibold">7. No Current Support Service</h2>

            <p>
              At the current stage of VideaAI, VideaAI does not provide a
              dedicated customer-support service or support channel.
            </p>

            <h2 className="text-xl font-semibold">8. Changes</h2>

            <p>
              VideaAI may change, improve, remove, or add features to the
              service as it develops. These Terms may also be updated when
              necessary.
            </p>

            <div className="border-primary/30 bg-primary/5 rounded-xl border p-5">
              <h2 className="text-xl font-semibold">Your Agreement</h2>

              <p className="mt-3">
                By creating an account or using VideaAI, you acknowledge that
                you understand that VideaAI is an AI video-generation platform,
                that AI-generated results may contain errors, that you are
                responsible for your use of generated content, and that you use
                VideaAI at your own responsibility and risk.
              </p>
            </div>

            <p className="border-t pt-6 text-center text-xs text-muted-foreground">
              VideaAI Terms & Conditions · Effective Date: October 10, 2026
            </p>
          </div>

          <div className="mt-8 text-center">
            <Link
              to="/login"
              className="text-primary text-sm hover:underline"
            >
              Back to login
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
