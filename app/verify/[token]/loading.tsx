export default function LoadingVerification() {
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
        <section className="ev-card ev-loading" role="status" aria-live="polite">
          <div className="ev-spinner" aria-hidden="true" />
          <h1 className="ev-title">Checking school ID…</h1>
          <p className="ev-description">Contacting the school's current verification record.</p>
        </section>
      </div>
    </main>
  );
}
