
"use client";

import React from "react";
import { useSupportUnread } from "../../../lib/support/useSupportUnread";

/**
 * Displays the unread message count on the
 * existing Eleeveon Hub button.
 */
export default function HubUnreadBadge() {
  const unread = useSupportUnread();

  if (unread <= 0) return null;

  return (
    <span
      aria-label={`${unread} unread ${
        unread === 1 ? "message" : "messages"
      }`}
      title={`${unread} unread ${
        unread === 1 ? "message" : "messages"
      }`}
      style={{
        position: "absolute",
        top: -7,
        right: -7,
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: 999,
        background: "#e11d48",
        color: "#fff",
        border: "2px solid var(--surface, #fff)",
        fontSize: 10,
        fontWeight: 800,
        lineHeight: "14px",
        textAlign: "center",
        whiteSpace: "nowrap",
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );
}
