// ======================================================
// app/api/auth/me/route.ts
// ======================================================

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

// ======================================================
// JWT PAYLOAD TYPE
// ======================================================

type TokenPayload = {
  id: string;
  accountId: string;
  email: string;
  role: string;
  fullName?: string;
  name?: string;
};

// ======================================================
// GET CURRENT SESSION
// ======================================================

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      return NextResponse.json(
        { message: "JWT_SECRET missing" },
        { status: 500 }
      );
    }

    const decoded = jwt.verify(token, secret) as TokenPayload;

    return NextResponse.json({
      user: {
        id: decoded.id,
        accountId: decoded.accountId,
        email: decoded.email,
        role: decoded.role,
        fullName: decoded.fullName || decoded.name || "",
      },

      account: {
        id: decoded.accountId,
        name: decoded.fullName || "Eleeveon Account",
      },
    });
  } catch (error) {
    console.error("AUTH /ME ERROR:", error);

    return NextResponse.json(
      { message: "Invalid or expired token" },
      { status: 401 }
    );
  }
}