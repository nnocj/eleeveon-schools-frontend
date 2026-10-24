import type { ReactNode } from "react";

// Live credential status must never be statically generated or cached by Next.js.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PublicVerification = {
  valid: boolean;
  status: string;
  fullName?: string;
  subjectType?: string;
  schoolName?: string;
  branchName?: string;
  className?: string;
  issuedAt?: string | null;
  expiresAt?: string | null;
};

type CheckResult =
  | { kind: "active"; data: PublicVerification }
  | { kind: "invalid" | "revoked" | "expired" | "inactive" }
  | { kind: "unavailable" };

type PageProps = { params: Promise<{ token: string }> };

// Matches the publicId.signature tokens issued by the NestJS identity service.
const TOKEN_PATTERN = /^[0-9a-f-]{36}\.[0-9a-f]{64}$/i;

function apiRoot(): string {
  const configured =
    process.env.IDENTITY_VERIFICATION_API_BASE_URL ||
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:4000"
      : "https://eleeveon-schools-backend.onrender.com");
  return configured.trim().replace(/\/+$/, "");
}

async function checkCredential(token: string): Promise<CheckResult> {
  if (!TOKEN_PATTERN.test(token)) return { kind: "invalid" };

  try {
    const url = `${apiRoot()}/identity/verify/${encodeURIComponent(token)}`;
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(25_000),
    });

    // A missing/degraded API is NOT evidence that the card is invalid.
    if (!response.ok) return { kind: "unavailable" };

    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== "object" ||
      typeof (body as Record<string, unknown>).valid !== "boolean" ||
      typeof (body as Record<string, unknown>).status !== "string"
    ) {
      return { kind: "unavailable" };
    }

    const data = body as PublicVerification;
    if (data.valid === true && data.status === "active") {
      return { kind: "active", data };
    }
    if (data.valid === false) {
      if (
        data.status === "revoked" ||
        data.status === "expired" ||
        data.status === "inactive"
      ) {
        return { kind: data.status };
      }
      return { kind: "invalid" };
    }
    // Conflicting status fields are a server error, never a positive verification.
    return { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

function dateText(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Accra",
  }).format(date);
}

function StatusIcon({ kind }: { kind: CheckResult["kind"] }) {
  if (kind === "active") {
    return (
      <svg viewBox="0 0 48 48" width="40" height="40" fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2.5" />
        <path d="m14.5 24 6.6 6.5L34 17.5" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "unavailable") {
    return (
      <svg viewBox="0 0 48 48" width="40" height="40" fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2.5" />
        <path d="M24 14v12m0 8h.01" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2.5" />
      <path d="m18 18 12 12m0-12L18 30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ev-detail">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const messages: Record<CheckResult["kind"], { title: string; description: string }> = {
  active: {
    title: "Valid school ID",
    description: "This ID is active in the issuing school's online records.",
  },
  revoked: {
    title: "ID no longer valid",
    description: "The issuing school has revoked or replaced this credential. Ask the school for a current ID.",
  },
  expired: {
    title: "ID has expired",
    description: "The validity period for this credential has ended. Ask the issuing school for a renewed ID.",
  },
  inactive: {
    title: "School record inactive",
    description: "The associated record is not currently eligible for an active school ID. Contact the issuing school.",
  },
  invalid: {
    title: "ID not recognized",
    description: "This verification code is invalid or no longer recognized. Confirm the QR code with the issuing school.",
  },
  unavailable: {
    title: "Verification unavailable",
    description: "We couldn't reach the school's verification service. This does not mean the ID is invalid. Please try again online.",
  },
};

export default async function VerifyCardPage({ params }: PageProps) {
  const { token } = await params;
  const result = await checkCredential(token || "");
  const message = messages[result.kind];
  const person = result.kind === "active" ? result.data : null;
  const name = person?.fullName?.trim() || "";
  const school = person?.schoolName?.trim() || "";
  const branch = person?.branchName?.trim() || "";
  const className = person?.className?.trim() || "";
  const subject = person?.subjectType === "student" ? "Student" : person?.subjectType === "teacher" ? "Teacher" : "School member";
  const issued = dateText(person?.issuedAt);
  const expires = dateText(person?.expiresAt);

  return (
    <main className="ev-page">
      <div className="ev-frame">
        <header className="ev-topbar">
          <div className="ev-brand-mark" aria-hidden="true">E</div>
          <div className="ev-brand-words">
            <strong>Eleeveon Schools</strong>
            <span>Identity verification</span>
          </div>
          <span className="ev-online-label">Official check</span>
        </header>

        <article className={`ev-card ev-card--${result.kind}`} aria-labelledby="ev-title">
          <div className="ev-card-top">
            <span className="ev-eyebrow">SCHOOL ID CHECK</span>
            <span className="ev-online-dot"><span aria-hidden="true" />Live record</span>
          </div>
          <div className={`ev-status-icon ev-status-icon--${result.kind}`}>
            <StatusIcon kind={result.kind} />
          </div>
          <p className="ev-status-kicker">Verification result</p>
          <h1 id="ev-title" className="ev-title">{message.title}</h1>
          <p className="ev-description">{message.description}</p>

          {person && (
            <section className="ev-details-section" aria-labelledby="ev-details-title">
              <h2 id="ev-details-title">Confirmed school details</h2>
              <dl className="ev-detail-list">
                {name && <Detail label="Full name">{name}</Detail>}
                <Detail label="Identity type">{subject}</Detail>
                {school && <Detail label="School">{school}</Detail>}
                {branch && <Detail label="Branch">{branch}</Detail>}
                {className && <Detail label="Class">{className}</Detail>}
                {issued && <Detail label="Issued">{issued}</Detail>}
                {expires && <Detail label="Valid until">{expires}</Detail>}
              </dl>
              {!name && (
                <p className="ev-privacy-note">
                  The issuing school has chosen not to display the cardholder's name publicly.
                </p>
              )}
            </section>
          )}

          <div className="ev-actions">
            <a className="ev-recheck" href={`/verify/${encodeURIComponent(token || "")}`}>
              Check again <span aria-hidden="true">↻</span>
            </a>
          </div>
        </article>

        <footer className="ev-footer">
          <span>Verification reflects the school's current online record. A valid QR code alone does not prove that the person presenting it is the cardholder.</span>
          <span className="ev-footer-brand">Powered by Eleeveon Schools</span>
        </footer>
      </div>
    </main>
  );
}

