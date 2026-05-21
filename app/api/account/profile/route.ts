// ======================================================
// FILE 3: app/api/account/profile/route.ts
// ======================================================

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "../../../lib/services/getAuthSession";
import {
  getAccountProfile,
  upsertAccountProfile,
} from "../../../lib/services/accountProfileStore";

export async function GET(req: NextRequest) {
  try {
    const session = getAuthSession(req);
    const profile = await getAccountProfile(session.accountId);

    return NextResponse.json({
      profile: profile || {
        accountId: session.accountId,
        ownerName: session.fullName || "",
        businessName: "",
        phone: "",
        email: session.email || "",
        address: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });
  } catch (error: any) {
    console.error("ACCOUNT PROFILE GET ERROR:", error);

    return NextResponse.json(
      { message: error?.message || "Unauthorized" },
      { status: error?.message === "JWT_SECRET missing" ? 500 : 401 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = getAuthSession(req);
    const body = await req.json();

    if (!body?.ownerName?.trim()) {
      return NextResponse.json(
        { message: "Owner name is required" },
        { status: 400 }
      );
    }

    const profile = await upsertAccountProfile(session.accountId, {
      ownerName: body.ownerName,
      businessName: body.businessName,
      phone: body.phone,
      email: body.email,
      address: body.address,
    });

    return NextResponse.json({ profile });
  } catch (error: any) {
    console.error("ACCOUNT PROFILE PATCH ERROR:", error);

    return NextResponse.json(
      { message: error?.message || "Failed to save profile" },
      { status: error?.message === "JWT_SECRET missing" ? 500 : 401 }
    );
  }
}

