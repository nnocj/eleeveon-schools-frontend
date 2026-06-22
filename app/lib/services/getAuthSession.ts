// ======================================================
// FILE 2: app/lib/services/getAuthSession.ts
// ======================================================

import { NextRequest } from "next/server";
const jwt = require("jsonwebtoken") as {
  verify(token: string, secretOrPublicKey: string): unknown;
};

export type AuthSession = {
  id: string;
  accountId: string;
  email: string;
  role: string;
  fullName: string;
};

type TokenPayload = {
  id: string;
  accountId: string;
  email: string;
  role: string;
  fullName?: string;
  name?: string;
};

export function getAuthSession(req: NextRequest): AuthSession {
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET missing");
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const decoded = jwt.verify(token, secret) as TokenPayload;

  return {
    id: decoded.id,
    accountId: decoded.accountId,
    email: decoded.email,
    role: decoded.role,
    fullName: decoded.fullName || decoded.name || "",
  };
}


