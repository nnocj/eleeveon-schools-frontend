"use client";

export default function VerificationError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="ev-page">
      <div className="ev-frame">
        <header className="ev-topbar">
          <div className="ev-brand-mark" aria-hidden="true">E</div>
          <div className="ev-brand-words">
            <strong>Eleeveon Schools</strong>
            <span>Identity verification</span>
          </div>
        </header>
        <section className="ev-card ev-error" role="alert" aria-labelledby="ev-error-title">
          <div className="ev-status-icon ev-status-icon--unavailable" aria-hidden="true">!</div>
          <h1 id="ev-error-title" className="ev-title">Verification unavailable</h1>
          <p className="ev-description">
            Something prevented us from checking this record. The ID has not been marked invalid.
          </p>
          <button className="ev-recheck" type="button" onClick={() => reset()}>
            Try again <span aria-hidden="true">↻</span>
          </button>
        </section>
      </div>
    </main>
  );
}
