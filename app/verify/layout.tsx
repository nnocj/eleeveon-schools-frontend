import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./verify.css";

export const metadata: Metadata = {
  title: "School ID Verification | Eleeveon Schools",
  description: "Check whether an Eleeveon Schools identity card is currently valid.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function VerifyLayout({ children }: { children: ReactNode }) {
  // This section is public. Do not wrap it in authentication/role redirects.
  return <div className="ev-verify">{children}</div>;
}

