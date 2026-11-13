/**
 * Dedicated packaged desktop entry. This page must never fetch the online
 * package catalogue or initiate a Cloud session. App-wide Providers mounts
 * IndependentRuntimeShell (signed license + local sign-in) for native builds.
 *
 * The screen is intentionally a placeholder behind that gate: it is NOT a
 * substitute for completing the original school portal authorization.
 */
import { notFound } from 'next/navigation';

export default function IndependentDesktopPage() {
  if (process.env.NEXT_PUBLIC_ELEEVEON_RUNTIME !== 'independent_essentials' &&
      process.env.NEXT_PUBLIC_ELEEVEON_RUNTIME !== 'independent_multi_device') {
    notFound();
  }
  return (
    <main className="mx-auto max-w-xl p-6" role="main">
      <h1 className="text-xl font-semibold">Eleeveon Schools Independent</h1>
      <p className="mt-2 text-sm">The installed application is running locally.</p>
      <p className="mt-2 text-sm">School portal access remains subject to the verified license and authorized local sign-in.</p>
    </main>
  );
}
