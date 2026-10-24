export default function VerifyStartPage() {
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
        <section className="ev-card ev-help" aria-labelledby="ev-start-title">
          <div className="ev-help-symbol" aria-hidden="true">▦</div>
          <span className="ev-eyebrow">PUBLIC ID VERIFICATION</span>
          <h1 id="ev-start-title" className="ev-title">Verify a school ID</h1>
          <p className="ev-description">
            Scan the QR code on an Eleeveon Schools student or teacher ID card
            with your phone camera. The verification link opens here and checks
            the school's current online record.
          </p>
          <p className="ev-privacy-note">
            No account or sign-in is required. If the card does not have a QR code,
            contact the issuing school.
          </p>
        </section>
        <footer className="ev-footer">Powered by Eleeveon Schools</footer>
      </div>
    </main>
  );
}

