"use client";

/**
 * app/components/role-portals/EleeveonCenter.tsx
 * --------------------------------------------------------------------------
 * Built-in portal module opened by RolePortalShell.navigate().
 *
 * This is intentionally not a standalone route. It behaves like Dashboard,
 * Students, Reports and every other portal tab while remaining shared by all
 * role portals.
 *
 * Role-aware behavior:
 * - developer / platform_team => Eleeveon support operations console.
 * - school/account roles => updates, feedback, support and access center.
 */

import EleeveonSupportChat from "./EleeveonSupportChat";
import HubSettingsPanel from "./HubSettingsPanel";
import { useHubAppearance } from "../../lib/support/useHubAppearance";
import { useSupportUnread } from "../../lib/support/useSupportUnread";
import EleeveonSurveys from "./EleeveonSurveys";
import { supportApi } from "../../lib/support/supportApi";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CSSProperties } from "react";

import {
  db,
  type LocalPlatformAnnouncement,
  type LocalPlatformAnnouncementReceipt,
  type LocalPlatformFeedbackMessage,
  type LocalPlatformRelease,
  type LocalPlatformReleaseNote,
  type PlatformFeedback,
  type PlatformFeedbackStatus,
  type PlatformFeedbackType,
} from "../../lib/db/db";

import {
  createLocal,
  updateLocal,
  type SyncableRecord,
} from "../../lib/sync/syncUtils";

import {
  useAccount,
} from "../../context/account-context";

import {
  useActiveMembership,
} from "../../context/active-membership-context";

import {
  useActiveBranch,
} from "../../context/active-branch-context";

import {
  useOptionalAccess,
} from "../../context/subscription-context";

import type {
  RolePortalRouteProps,
} from "./RolePortalShell";

type CenterSection =
  | "inbox"
  | "communications"
  | "releases"
  | "updates"
  | "feedback"
  | "support"
  | "access";

type FeedbackPriority =
  | "low"
  | "normal"
  | "high"
  | "urgent";

type AnnouncementReceiptCreateInput =
  SyncableRecord & {
    id: string;
    announcementId: string;
    userId?: string | null;
    membershipId?: string | null;
    deliveredAt?: string | null;
    readAt?: string | null;
    acknowledgedAt?: string | null;
    dismissedAt?: string | null;
  };

type FeedbackCreateInput =
  SyncableRecord & {
    id: string;
    schoolId?: string | null;
    branchId?: string | null;
    userId?: string | null;
    membershipId?: string | null;
    type: PlatformFeedbackType;
    status: "submitted";
    priority: "normal";
    subject: string;
    message: string;
    appVersion?: string | null;
    route?: string | null;
    deviceInfo?: Record<
      string,
      unknown
    > | null;
    submittedAt: number;
    metadata?: Record<
      string,
      unknown
    > | null;
  };

type FeedbackMessageCreateInput =
  SyncableRecord & {
    id: string;
    feedbackId: string;
    senderType: "platform";
    senderUserId?: string | null;
    body: string;
    readAt?: string | null;
    metadata?: Record<
      string,
      unknown
    > | null;
  };

const feedbackTypes: Array<{
  value: PlatformFeedbackType;
  label: string;
}> = [
  {
    value: "suggestion",
    label: "Suggestion",
  },
  {
    value: "complaint",
    label: "Complaint",
  },
  {
    value: "bug",
    label: "Bug report",
  },
  {
    value: "support_request",
    label: "Support request",
  },
  {
    value: "feature_request",
    label: "Feature request",
  },
  {
    value: "billing_question",
    label: "Billing question",
  },
  {
    value: "general_feedback",
    label: "General feedback",
  },
];

const feedbackStatuses:
  PlatformFeedbackStatus[] = [
    "submitted",
    "acknowledged",
    "under_review",
    "planned",
    "in_progress",
    "resolved",
    "closed",
  ];

const feedbackPriorities:
  FeedbackPriority[] = [
    "low",
    "normal",
    "high",
    "urgent",
  ];

const announcementRoles = [
  "owner",
  "super_admin",
  "admin",
  "branch_admin",
  "teacher",
  "student",
  "accountant",
  "parent",
] as const;

const announcementTypes = [
  "update",
  "maintenance",
  "security",
  "billing",
  "general",
] as const;

const releaseChannels = [
  "stable",
  "preview",
  "security",
] as const;

function localDateTimeValue(
  iso?: string | null,
) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset =
    date.getTimezoneOffset() * 60_000;

  return new Date(
    date.getTime() - offset,
  )
    .toISOString()
    .slice(0, 16);
}

function isoFromLocalInput(
  value: string,
) {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

function idOf(value: unknown) {
  return value == null
    ? ""
    : String(value).trim();
}

function stableId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function dateText(
  value?: string | number | null,
) {
  if (!value) return "Recently";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Recently"
    : date.toLocaleString(
        "en-GH",
        {
          dateStyle: "medium",
          timeStyle: "short",
        },
      );
}

function titleText(value: unknown) {
  return idOf(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function metadataText(
  metadata: Record<
    string,
    unknown
  > | null | undefined,
  key: string,
) {
  const value = metadata?.[key];

  return value == null ||
    String(value).trim() === ""
    ? ""
    : String(value);
}

function visibleAnnouncement(
  announcement:
    LocalPlatformAnnouncement,
  role?: string | null,
) {
  if (
    announcement.status !==
    "published"
  ) {
    return false;
  }

  const now = Date.now();

  if (
    announcement.publishAt &&
    new Date(
      announcement.publishAt,
    ).getTime() > now
  ) {
    return false;
  }

  if (
    announcement.expiresAt &&
    new Date(
      announcement.expiresAt,
    ).getTime() < now
  ) {
    return false;
  }

  if (
    announcement.targetRoles?.length &&
    role &&
    !announcement.targetRoles.includes(
      role,
    )
  ) {
    return false;
  }

  return true;
}

export default function EleeveonCenter({
  navigate,
}: RolePortalRouteProps) {
  const {
    accountId,
    account,
    user,
  } = useAccount() as any;

  const {
    activeMembership,
  } = useActiveMembership();

  const {
    activeSchoolId,
    activeBranchId,
    activeSchool,
    activeBranch,
  } = useActiveBranch();

  const access =
    useOptionalAccess();

  const userId = idOf(user?.id);
  const hubAppearance = useHubAppearance(idOf(accountId), userId);
  const [hubSettingsOpen, setHubSettingsOpen] = useState(false);
  const [hubSettingsConversationId,setHubSettingsConversationId]=useState('');
  const openHubSettings=(conversationId?:string)=>{setHubSettingsConversationId(conversationId||'');setHubSettingsOpen(true);};

  const membershipId = idOf(
    activeMembership?.id,
  );

  const role =
    activeMembership?.role ??
    account?.role ??
    user?.role ??
    null;

  const isDeveloper =
    role === "developer" ||
    role === "platform_team";

  const [section, setSection] =
    useState<CenterSection>(
      isDeveloper
        ? "inbox"
        : "support",
    );

  const [
    announcements,
    setAnnouncements,
  ] = useState<
    LocalPlatformAnnouncement[]
  >([]);

  const [
    platformReleases,
    setPlatformReleases,
  ] = useState<
    LocalPlatformRelease[]
  >([]);

  const [
    releaseNotes,
    setReleaseNotes,
  ] = useState<
    LocalPlatformReleaseNote[]
  >([]);

  const [
    announcementType,
    setAnnouncementType,
  ] = useState<
    LocalPlatformAnnouncement["type"]
  >("general");

  const [
    announcementPriority,
    setAnnouncementPriority,
  ] = useState<
    LocalPlatformAnnouncement["priority"]
  >("normal");

  const [
    announcementTitle,
    setAnnouncementTitle,
  ] = useState("");

  const [
    announcementBody,
    setAnnouncementBody,
  ] = useState("");

  const [
    announcementActionLabel,
    setAnnouncementActionLabel,
  ] = useState("");

  const [
    announcementActionUrl,
    setAnnouncementActionUrl,
  ] = useState("");

  const [
    announcementTargetRoles,
    setAnnouncementTargetRoles,
  ] = useState<string[]>([]);

  const [
    announcementPublishAt,
    setAnnouncementPublishAt,
  ] = useState("");

  const [
    announcementExpiresAt,
    setAnnouncementExpiresAt,
  ] = useState("");

  const [
    announcementRequiresAck,
    setAnnouncementRequiresAck,
  ] = useState(false);

  const [
    announcementDismissible,
    setAnnouncementDismissible,
  ] = useState(true);

  const [
    releaseVersion,
    setReleaseVersion,
  ] = useState("");

  const [
    releaseTitle,
    setReleaseTitle,
  ] = useState("");

  const [
    releaseSummary,
    setReleaseSummary,
  ] = useState("");

  const [
    releaseChannel,
    setReleaseChannel,
  ] = useState<
    LocalPlatformRelease["channel"]
  >("stable");

  const [
    releaseMinimumVersion,
    setReleaseMinimumVersion,
  ] = useState("");

  const [
    releaseNoteTitle,
    setReleaseNoteTitle,
  ] = useState("");

  const [
    releaseNoteBody,
    setReleaseNoteBody,
  ] = useState("");

  const [receipts, setReceipts] =
    useState<
      LocalPlatformAnnouncementReceipt[]
    >([]);

  const [feedback, setFeedback] =
    useState<PlatformFeedback[]>([]);

  const [
    feedbackMessages,
    setFeedbackMessages,
  ] = useState<
    LocalPlatformFeedbackMessage[]
  >([]);

  const [
    selectedFeedbackId,
    setSelectedFeedbackId,
  ] = useState("");

  const [
    developerFilter,
    setDeveloperFilter,
  ] = useState<
    "open" | "all" | PlatformFeedbackStatus
  >("open");

  const [
    developerSearch,
    setDeveloperSearch,
  ] = useState("");

  const [replyBody, setReplyBody] =
    useState("");

  const [feedbackType, setFeedbackType] =
    useState<PlatformFeedbackType>(
      "suggestion",
    );

  const [subject, setSubject] =
    useState("");

  const [messageBody, setMessageBody] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [notice, setNotice] =
    useState<string | null>(null);

  useEffect(() => {
    setSection(
      isDeveloper
        ? "inbox"
        : "support",
    );
  }, [isDeveloper]);

  const load = async () => {
    if (!accountId && !isDeveloper) {
      return;
    }

    const [
      announcementRows,
      releaseRows,
      releaseNoteRows,
      receiptRows,
      feedbackRows,
      messageRows,
    ] = await Promise.all([
      db.platformAnnouncements.toArray(),
      db.platformReleases.toArray(),
      db.platformReleaseNotes.toArray(),
      isDeveloper
        ? db.platformAnnouncementReceipts
            .toArray()
        : db.platformAnnouncementReceipts
            .where("accountId")
            .equals(accountId)
            .toArray(),
      isDeveloper
        ? db.platformFeedback.toArray()
        : db.platformFeedback
            .where("accountId")
            .equals(accountId)
            .toArray(),
      isDeveloper
        ? db.platformFeedbackMessages
            .toArray()
        : db.platformFeedbackMessages
            .where("accountId")
            .equals(accountId)
            .toArray(),
    ]);

    const sortedAnnouncements =
      announcementRows.sort(
        (left, right) =>
          new Date(
            right.publishAt ??
              right.updatedAt ??
              right.createdAt ??
              0,
          ).getTime() -
          new Date(
            left.publishAt ??
              left.updatedAt ??
              left.createdAt ??
              0,
          ).getTime(),
      );

    setAnnouncements(
      isDeveloper
        ? sortedAnnouncements
        : sortedAnnouncements.filter(
            (row) =>
              visibleAnnouncement(
                row,
                role,
              ),
          ),
    );

    setPlatformReleases(
      releaseRows.sort(
        (left, right) =>
          new Date(
            right.publishedAt ??
              right.updatedAt ??
              right.createdAt ??
              0,
          ).getTime() -
          new Date(
            left.publishedAt ??
              left.updatedAt ??
              left.createdAt ??
              0,
          ).getTime(),
      ),
    );

    setReleaseNotes(
      releaseNoteRows.sort(
        (left, right) =>
          Number(
            left.displayOrder ?? 0,
          ) -
          Number(
            right.displayOrder ?? 0,
          ),
      ),
    );

    setReceipts(receiptRows);

    const sortedFeedback =
      feedbackRows.sort(
        (left, right) =>
          Number(
            right.lastServerMessageAt ??
              right.submittedAt,
          ) -
          Number(
            left.lastServerMessageAt ??
              left.submittedAt,
          ),
      );

    setFeedback(sortedFeedback);

    setFeedbackMessages(
      messageRows.sort(
        (left, right) =>
          new Date(
            left.createdAt,
          ).getTime() -
          new Date(
            right.createdAt,
          ).getTime(),
      ),
    );

    if (
      isDeveloper &&
      sortedFeedback.length
    ) {
      setSelectedFeedbackId(
        (current) =>
          current &&
          sortedFeedback.some(
            (item) =>
              item.id === current,
          )
            ? current
            : sortedFeedback[0].id,
      );
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accountId,
    role,
    isDeveloper,
  ]);

  const receiptByAnnouncement =
    useMemo(
      () =>
        new Map(
          receipts.map((receipt) => [
            receipt.announcementId,
            receipt,
          ]),
        ),
      [receipts],
    );

  const unreadCount =
    announcements.filter(
      (announcement) =>
        !receiptByAnnouncement.get(
          announcement.id,
        )?.readAt,
    ).length;

  const releaseNotesByRelease =
    useMemo(() => {
      const map = new Map<
        string,
        LocalPlatformReleaseNote[]
      >();

      releaseNotes.forEach((note) => {
        const current =
          map.get(note.releaseId) ?? [];
        current.push(note);
        map.set(note.releaseId, current);
      });

      return map;
    }, [releaseNotes]);

  const visibleReleases =
    useMemo(
      () =>
        platformReleases.filter(
          (release) =>
            isDeveloper ||
            release.status ===
              "published",
        ),
      [
        isDeveloper,
        platformReleases,
      ],
    );

  const selectedFeedback =
    useMemo(
      () =>
        feedback.find(
          (item) =>
            item.id ===
            selectedFeedbackId,
        ),
      [
        feedback,
        selectedFeedbackId,
      ],
    );

  const selectedMessages =
    useMemo(
      () =>
        feedbackMessages.filter(
          (message) =>
            message.feedbackId ===
            selectedFeedbackId,
        ),
      [
        feedbackMessages,
        selectedFeedbackId,
      ],
    );

  const developerTickets =
    useMemo(() => {
      const query =
        developerSearch
          .trim()
          .toLowerCase();

      return feedback.filter(
        (item) => {
          const statusMatch =
            developerFilter === "all"
              ? true
              : developerFilter ===
                  "open"
                ? ![
                    "resolved",
                    "closed",
                  ].includes(
                    item.status,
                  )
                : item.status ===
                  developerFilter;

          if (!statusMatch) {
            return false;
          }

          if (!query) {
            return true;
          }

          const metadata =
            item.metadata as
              | Record<
                  string,
                  unknown
                >
              | null
              | undefined;

          return [
            item.subject,
            item.message,
            item.type,
            item.status,
            item.priority,
            item.accountId,
            item.schoolId,
            item.branchId,
            item.userId,
            metadataText(
              metadata,
              "schoolName",
            ),
            metadataText(
              metadata,
              "branchName",
            ),
            metadataText(
              metadata,
              "role",
            ),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query);
        },
      );
    }, [
      developerFilter,
      developerSearch,
      feedback,
    ]);

  const developerSummary =
    useMemo(() => {
      const open =
        feedback.filter(
          (item) =>
            ![
              "resolved",
              "closed",
            ].includes(item.status),
        ).length;

      const newCount =
        feedback.filter(
          (item) =>
            item.status === "submitted",
        ).length;

      const urgent =
        feedback.filter(
          (item) =>
            item.priority === "urgent" ||
            item.priority === "high",
        ).length;

      const resolved =
        feedback.filter(
          (item) =>
            item.status === "resolved",
        ).length;

      return {
        open,
        newCount,
        urgent,
        resolved,
      };
    }, [feedback]);

  const markRead = async (
    announcement:
      LocalPlatformAnnouncement,
  ) => {
    if (!accountId) return;

    const existing =
      receiptByAnnouncement.get(
        announcement.id,
      );

    const patch = {
      accountId,
      announcementId:
        announcement.id,
      userId: userId || null,
      membershipId:
        membershipId || null,
      deliveredAt:
        existing?.deliveredAt ??
        new Date().toISOString(),
      readAt:
        new Date().toISOString(),
      acknowledgedAt:
        existing?.acknowledgedAt ??
        null,
      dismissedAt:
        existing?.dismissedAt ??
        null,
    };

    if (existing) {
      await updateLocal(
        "platformAnnouncementReceipts",
        existing.id,
        patch,
      );
    } else {
      const input:
        AnnouncementReceiptCreateInput =
        {
          id: stableId(),
          ...patch,
        };

      await createLocal<
        AnnouncementReceiptCreateInput
      >(
        "platformAnnouncementReceipts",
        input,
      );
    }

    await load();
  };

  const submitFeedback = async () => {
    if (feedbackType === "support_request") {
      setNotice(null);
      setSection("support");
      return;
    }
    if (!subject.trim() || !messageBody.trim()) { setNotice("Enter a subject and a message."); return; }
    try {
      setSaving(true);
      setNotice(null);
      await supportApi.create({
        subject: subject.trim(), body: messageBody.trim(), type: feedbackType,
        schoolId: activeSchoolId ?? undefined,
        branchId: activeBranchId ?? undefined,
        membershipId: membershipId || undefined,
        name: user?.fullName || user?.name || undefined,
      });
      setSubject(""); setMessageBody("");
      setNotice("Sent to Eleeveon.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not send the survey to Eleeveon.");
    } finally { setSaving(false); }
  };

  const updateFeedbackStatus =
    async (
      item: PlatformFeedback,
      status:
        PlatformFeedbackStatus,
    ) => {
      if (!isDeveloper) return;

      try {
        setSaving(true);
        setNotice(null);

        const now = Date.now();

        await updateLocal(
          "platformFeedback",
          item.id,
          {
            status,
            acknowledgedAt:
              status !== "submitted"
                ? item.acknowledgedAt ??
                  now
                : item.acknowledgedAt ??
                  null,
            resolvedAt:
              status === "resolved" ||
              status === "closed"
                ? item.resolvedAt ??
                  now
                : null,
          },
        );

        await load();
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Could not update ticket status.",
        );
      } finally {
        setSaving(false);
      }
    };

  const updateFeedbackPriority =
    async (
      item: PlatformFeedback,
      priority: FeedbackPriority,
    ) => {
      if (!isDeveloper) return;

      try {
        setSaving(true);
        setNotice(null);

        await updateLocal(
          "platformFeedback",
          item.id,
          {
            priority,
          },
        );

        await load();
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Could not update ticket priority.",
        );
      } finally {
        setSaving(false);
      }
    };

  const sendDeveloperReply =
    async () => {
      if (
        !isDeveloper ||
        !selectedFeedback ||
        !replyBody.trim()
      ) {
        return;
      }

      try {
        setSaving(true);
        setNotice(null);

        const now =
          new Date().toISOString();

        const input:
          FeedbackMessageCreateInput = {
          id: stableId(),
          accountId:
            selectedFeedback.accountId,
          feedbackId:
            selectedFeedback.id,
          senderType: "platform",
          senderUserId:
            userId || null,
          body: replyBody.trim(),
          readAt: null,
          metadata: {
            role,
          },
        };

        await createLocal<
          FeedbackMessageCreateInput
        >(
          "platformFeedbackMessages",
          input,
        );

        await updateLocal(
          "platformFeedback",
          selectedFeedback.id,
          {
            status:
              selectedFeedback.status ===
              "submitted"
                ? "acknowledged"
                : selectedFeedback.status,
            acknowledgedAt:
              selectedFeedback
                .acknowledgedAt ??
              Date.now(),
            lastServerMessageAt:
              Date.now(),
          },
        );

        setReplyBody("");
        setNotice(
          "Reply saved and queued for sync.",
        );

        await load();
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Could not send the support reply.",
        );
      } finally {
        setSaving(false);
      }
    };

  const toggleAnnouncementRole = (
    targetRole: string,
  ) => {
    setAnnouncementTargetRoles(
      (current) =>
        current.includes(targetRole)
          ? current.filter(
              (item) =>
                item !== targetRole,
            )
          : [...current, targetRole],
    );
  };

  const saveAnnouncement =
    async (
      status:
        | "draft"
        | "scheduled"
        | "published",
    ) => {
      if (
        !isDeveloper ||
        !announcementTitle.trim() ||
        !announcementBody.trim()
      ) {
        setNotice(
          "Add an announcement title and message.",
        );
        return;
      }

      try {
        setSaving(true);
        setNotice(null);

        const now =
          new Date().toISOString();

        const publishAt =
          status === "published"
            ? now
            : isoFromLocalInput(
                announcementPublishAt,
              );

        const row:
          LocalPlatformAnnouncement = {
          id: stableId(),
          key: `portal-${Date.now().toString(36)}`,
          type: announcementType,
          priority:
            announcementPriority,
          title:
            announcementTitle.trim(),
          body:
            announcementBody.trim(),
          actionLabel:
            announcementActionLabel.trim() ||
            null,
          actionUrl:
            announcementActionUrl.trim() ||
            null,
          locale: "en-GH",
          targetRoles:
            announcementTargetRoles.length
              ? announcementTargetRoles
              : null,
          targetCountries: null,
          targetPlanIds: null,
          targetDeploymentModes: null,
          minimumAppVersion: null,
          maximumAppVersion: null,
          requiresAcknowledgement:
            announcementRequiresAck,
          dismissible:
            announcementDismissible,
          status,
          publishAt,
          expiresAt:
            isoFromLocalInput(
              announcementExpiresAt,
            ),
          createdAt: now,
          updatedAt: now,
        };

        await db.platformAnnouncements.put(
          row,
        );

        setAnnouncementTitle("");
        setAnnouncementBody("");
        setAnnouncementActionLabel("");
        setAnnouncementActionUrl("");
        setAnnouncementTargetRoles([]);
        setAnnouncementPublishAt("");
        setAnnouncementExpiresAt("");
        setAnnouncementRequiresAck(false);
        setAnnouncementDismissible(true);

        setNotice(
          status === "published"
            ? "Announcement published in the local platform cache."
            : status === "scheduled"
              ? "Announcement scheduled in the local platform cache."
              : "Announcement saved as a draft.",
        );

        await load();
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Could not save the announcement.",
        );
      } finally {
        setSaving(false);
      }
    };

  const setAnnouncementStatus =
    async (
      announcement:
        LocalPlatformAnnouncement,
      status:
        | "draft"
        | "published"
        | "withdrawn",
    ) => {
      if (!isDeveloper) return;

      const now =
        new Date().toISOString();

      await db.platformAnnouncements.put({
        ...announcement,
        status,
        publishAt:
          status === "published"
            ? announcement.publishAt ??
              now
            : announcement.publishAt,
        updatedAt: now,
      });

      await load();
    };

  const saveRelease =
    async (
      status:
        | "draft"
        | "published",
    ) => {
      if (
        !isDeveloper ||
        !releaseVersion.trim() ||
        !releaseTitle.trim() ||
        !releaseNoteBody.trim()
      ) {
        setNotice(
          "Add a version, release title and release notes.",
        );
        return;
      }

      try {
        setSaving(true);
        setNotice(null);

        const now =
          new Date().toISOString();

        const releaseId =
          stableId();

        const majorVersion =
          Number.parseInt(
            releaseVersion
              .trim()
              .replace(/^v/i, "")
              .split(".")[0] || "0",
            10,
          );

        const release:
          LocalPlatformRelease = {
          id: releaseId,
          version:
            releaseVersion.trim(),
          majorVersion:
            Number.isFinite(
              majorVersion,
            )
              ? majorVersion
              : 0,
          channel: releaseChannel,
          title:
            releaseTitle.trim(),
          summary:
            releaseSummary.trim() ||
            null,
          status,
          minimumSupportedVersion:
            releaseMinimumVersion.trim() ||
            null,
          publishedAt:
            status === "published"
              ? now
              : null,
          metadata: {
            createdFrom:
              "eleeveon_center",
            createdByRole: role,
            createdByUserId:
              userId || null,
          },
          createdAt: now,
          updatedAt: now,
        };

        const note:
          LocalPlatformReleaseNote = {
          id: stableId(),
          releaseId,
          locale: "en-GH",
          title:
            releaseNoteTitle.trim() ||
            releaseTitle.trim(),
          body:
            releaseNoteBody.trim(),
          displayOrder: 0,
          createdAt: now,
          updatedAt: now,
        };

        await db.transaction(
          "rw",
          db.platformReleases,
          db.platformReleaseNotes,
          async () => {
            await db.platformReleases.put(
              release,
            );
            await db.platformReleaseNotes.put(
              note,
            );
          },
        );

        setReleaseVersion("");
        setReleaseTitle("");
        setReleaseSummary("");
        setReleaseMinimumVersion("");
        setReleaseNoteTitle("");
        setReleaseNoteBody("");

        setNotice(
          status === "published"
            ? "Release published in the local platform cache."
            : "Release saved as a draft.",
        );

        await load();
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Could not save the release.",
        );
      } finally {
        setSaving(false);
      }
    };

  const setReleaseStatus =
    async (
      release:
        LocalPlatformRelease,
      status:
        | "draft"
        | "published"
        | "withdrawn",
    ) => {
      if (!isDeveloper) return;

      const now =
        new Date().toISOString();

      await db.platformReleases.put({
        ...release,
        status,
        publishedAt:
          status === "published"
            ? release.publishedAt ??
              now
            : release.publishedAt,
        updatedAt: now,
      });

      await load();
    };

  const selectedMetadata =
    (selectedFeedback?.metadata ??
      null) as
      | Record<string, unknown>
      | null;

  const selectedDeviceInfo =
    (selectedFeedback?.deviceInfo ??
      null) as
      | Record<string, unknown>
      | null;

  const supportUnread = useSupportUnread();
  const chatSection: CenterSection = isDeveloper ? "inbox" : "support";
  const centerTabs = (
    <div className="hub-nav-with-settings">
    <nav className="center-inline-tabs" aria-label="Eleeveon Center sections">
      <button type="button" className={section === chatSection ? "active" : ""} aria-current={section === chatSection ? "page" : undefined} onClick={() => setSection(chatSection)}>Chat{supportUnread > 0 ? ` · ${supportUnread > 99 ? "99+" : supportUnread}` : ""}</button>
      <button type="button" className={section === "feedback" ? "active" : ""} aria-current={section === "feedback" ? "page" : undefined} onClick={() => setSection("feedback")}>Surveys</button>
      <button type="button" className={section === "updates" ? "active" : ""} aria-current={section === "updates" ? "page" : undefined} onClick={() => setSection("updates")}>Updates{unreadCount > 0 ? ` · ${unreadCount}` : ""}</button>
      <button type="button" className={section === "access" ? "active" : ""} aria-current={section === "access" ? "page" : undefined} onClick={() => setSection("access")}>Access</button>
      {isDeveloper && (
        <select
          className="center-inline-more"
          aria-label="More platform sections"
          value={section === "communications" || section === "releases" ? section : ""}
          onChange={event => {
            if (event.target.value) setSection(event.target.value as CenterSection);
          }}
        >
          <option value="">More ▾</option>
          <option value="communications">Communications</option>
          <option value="releases">Releases</option>
        </select>
      )}
    </nav>
    <button type="button" className="hub-settings-gear" title="Hub settings" aria-label="Hub settings" onClick={() => openHubSettings()}>⚙</button>
    </div>
  );
  // In a phone conversation, the thread header replaces the standalone tabs row.
  // This compact picker keeps Surveys/Updates/Access reachable without shrinking the chat.
  const mobileChatNavigation = (
    <select
      className="center-mobile-chat-switch"
      aria-label="Eleeveon Center section"
      value={section}
      onChange={event => setSection(event.target.value as CenterSection)}
    >
      <option value={chatSection}>Chat{supportUnread > 0 ? ` (${supportUnread})` : ""}</option>
      <option value="feedback">Surveys</option>
      <option value="updates">Updates</option>
      <option value="access">Access</option>
      {isDeveloper && <option value="communications">Communications</option>}
      {isDeveloper && <option value="releases">Releases</option>}
    </select>
  );

  return (
    <main className="center-module hub-module" style={{ "--hub-scene": hubAppearance.imageCss } as CSSProperties}>
      <style>{css}</style>
      {hubSettingsOpen && <HubSettingsPanel onClose={() => setHubSettingsOpen(false)} conversationId={hubSettingsConversationId} accountId={idOf(accountId)} userId={userId} currentUserName={idOf(user?.fullName || user?.name || [user?.firstName,user?.lastName].filter(Boolean).join(' '))} currentAccountName={idOf(account?.name || account?.displayName)} images={hubAppearance.images} selectedId={hubAppearance.selectedId} select={hubAppearance.select} addUpload={hubAppearance.addUpload} removeUpload={hubAppearance.removeUpload} reload={hubAppearance.reload} error={hubAppearance.error} />}

      <div className="center-shell">
        <div className="center-work-area">
          {section !== chatSection && (
            <header className="center-section-header">
              {centerTabs}
            </header>
          )}
      {section === "inbox" && isDeveloper ? (
        <EleeveonSupportChat
          navigation={centerTabs}
          onOpenHubSettings={openHubSettings}
          mobileNavigation={mobileChatNavigation}
          isDeveloper={true}
          accountId={idOf(accountId)}
          schoolId={activeSchoolId}
          branchId={activeBranchId}
          userId={userId}
          membershipId={membershipId}
          role={role}
          schoolName={activeSchool?.name}
          branchName={activeBranch?.name}
        />
      ) : null}

      {section ===
        "communications" &&
      isDeveloper ? (
        <section className="center-publisher-layout">
          <article className="center-card">
            <span className="kicker">
              Outbound communication
            </span>
            <h3>
              Create platform announcement
            </h3>
            <p>
              Publish notices, maintenance
              messages, security alerts,
              billing messages or general
              platform communication to
              selected portal roles.
            </p>

            <div className="center-form-grid">
              <label>
                Type
                <select
                  value={
                    announcementType
                  }
                  onChange={(event) =>
                    setAnnouncementType(
                      event.target.value,
                    )
                  }
                >
                  {announcementTypes.map(
                    (item) => (
                      <option
                        key={item}
                        value={item}
                      >
                        {titleText(
                          item,
                        )}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label>
                Priority
                <select
                  value={
                    announcementPriority
                  }
                  onChange={(event) =>
                    setAnnouncementPriority(
                      event.target
                        .value as LocalPlatformAnnouncement["priority"],
                    )
                  }
                >
                  {feedbackPriorities.map(
                    (item) => (
                      <option
                        key={item}
                        value={item}
                      >
                        {titleText(
                          item,
                        )}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>

            <label>
              Title
              <input
                value={
                  announcementTitle
                }
                onChange={(event) =>
                  setAnnouncementTitle(
                    event.target.value,
                  )
                }
                placeholder="Short announcement title"
              />
            </label>

            <label>
              Message
              <textarea
                rows={6}
                value={
                  announcementBody
                }
                onChange={(event) =>
                  setAnnouncementBody(
                    event.target.value,
                  )
                }
                placeholder="Write the message users should receive."
              />
            </label>

            <div className="center-form-grid">
              <label>
                Action label
                <input
                  value={
                    announcementActionLabel
                  }
                  onChange={(event) =>
                    setAnnouncementActionLabel(
                      event.target.value,
                    )
                  }
                  placeholder="Open reports"
                />
              </label>

              <label>
                Action route / URL
                <input
                  value={
                    announcementActionUrl
                  }
                  onChange={(event) =>
                    setAnnouncementActionUrl(
                      event.target.value,
                    )
                  }
                  placeholder="#reports or URL"
                />
              </label>
            </div>

            <div className="center-audience">
              <span>
                Audience
              </span>
              <small>
                Leave every role unchecked
                to target all user roles.
              </small>

              <div className="center-role-options">
                {announcementRoles.map(
                  (targetRole) => (
                    <label
                      key={targetRole}
                      className="center-check"
                    >
                      <input
                        type="checkbox"
                        checked={announcementTargetRoles.includes(
                          targetRole,
                        )}
                        onChange={() =>
                          toggleAnnouncementRole(
                            targetRole,
                          )
                        }
                      />
                      <span>
                        {titleText(
                          targetRole,
                        )}
                      </span>
                    </label>
                  ),
                )}
              </div>
            </div>

            <div className="center-form-grid">
              <label>
                Schedule for
                <input
                  type="datetime-local"
                  value={
                    announcementPublishAt
                  }
                  onChange={(event) =>
                    setAnnouncementPublishAt(
                      event.target.value,
                    )
                  }
                />
              </label>

              <label>
                Expires
                <input
                  type="datetime-local"
                  value={
                    announcementExpiresAt
                  }
                  onChange={(event) =>
                    setAnnouncementExpiresAt(
                      event.target.value,
                    )
                  }
                />
              </label>
            </div>

            <div className="center-inline-checks">
              <label className="center-check">
                <input
                  type="checkbox"
                  checked={
                    announcementRequiresAck
                  }
                  onChange={(event) =>
                    setAnnouncementRequiresAck(
                      event.target.checked,
                    )
                  }
                />
                <span>
                  Require acknowledgement
                </span>
              </label>

              <label className="center-check">
                <input
                  type="checkbox"
                  checked={
                    announcementDismissible
                  }
                  onChange={(event) =>
                    setAnnouncementDismissible(
                      event.target.checked,
                    )
                  }
                />
                <span>
                  Allow dismiss
                </span>
              </label>
            </div>

            <div className="center-publish-actions">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void saveAnnouncement(
                    "draft",
                  )
                }
              >
                Save draft
              </button>

              <button
                type="button"
                disabled={
                  saving ||
                  !announcementPublishAt
                }
                onClick={() =>
                  void saveAnnouncement(
                    "scheduled",
                  )
                }
              >
                Schedule
              </button>

              <button
                type="button"
                className="primary"
                disabled={saving}
                onClick={() =>
                  void saveAnnouncement(
                    "published",
                  )
                }
              >
                Publish now
              </button>
            </div>

            {notice ? (
              <div className="notice">
                {notice}
              </div>
            ) : null}
          </article>

          <article className="center-card">
            <span className="kicker">
              Announcement manager
            </span>
            <h3>
              Platform communications
            </h3>

            <div className="center-manager-list">
              {announcements.length ? (
                announcements.map(
                  (item) => (
                    <div
                      key={item.id}
                      className="center-manager-item"
                    >
                      <div className="center-manager-heading">
                        <strong>
                          {item.title}
                        </strong>
                        <span className="center-badge">
                          {titleText(
                            item.status,
                          )}
                        </span>
                      </div>

                      <p>{item.body}</p>

                      <small>
                        {titleText(
                          item.type,
                        )}
                        {" · "}
                        {titleText(
                          item.priority,
                        )}
                        {" · "}
                        {item.targetRoles
                          ?.length
                          ? item.targetRoles
                              .map(
                                titleText,
                              )
                              .join(", ")
                          : "All roles"}
                      </small>

                      <div className="center-manager-actions">
                        {item.status !==
                        "published" ? (
                          <button
                            type="button"
                            onClick={() =>
                              void setAnnouncementStatus(
                                item,
                                "published",
                              )
                            }
                          >
                            Publish
                          </button>
                        ) : null}

                        {item.status ===
                        "published" ? (
                          <button
                            type="button"
                            onClick={() =>
                              void setAnnouncementStatus(
                                item,
                                "withdrawn",
                              )
                            }
                          >
                            Withdraw
                          </button>
                        ) : null}

                        {item.status ===
                        "withdrawn" ? (
                          <button
                            type="button"
                            onClick={() =>
                              void setAnnouncementStatus(
                                item,
                                "draft",
                              )
                            }
                          >
                            Restore draft
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ),
                )
              ) : (
                <p>
                  No platform
                  communications yet.
                </p>
              )}
            </div>
          </article>
        </section>
      ) : null}

      {section === "releases" &&
      isDeveloper ? (
        <section className="center-publisher-layout">
          <article className="center-card">
            <span className="kicker">
              Product release
            </span>
            <h3>
              Publish an Eleeveon update
            </h3>
            <p>
              Create version information
              and user-facing release notes
              for the platform update.
            </p>

            <div className="center-form-grid">
              <label>
                Version
                <input
                  value={releaseVersion}
                  onChange={(event) =>
                    setReleaseVersion(
                      event.target.value,
                    )
                  }
                  placeholder="1.3.0"
                />
              </label>

              <label>
                Channel
                <select
                  value={releaseChannel}
                  onChange={(event) =>
                    setReleaseChannel(
                      event.target.value,
                    )
                  }
                >
                  {releaseChannels.map(
                    (channel) => (
                      <option
                        key={channel}
                        value={channel}
                      >
                        {titleText(
                          channel,
                        )}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>

            <label>
              Release title
              <input
                value={releaseTitle}
                onChange={(event) =>
                  setReleaseTitle(
                    event.target.value,
                  )
                }
                placeholder="Reports and assessment improvements"
              />
            </label>

            <label>
              Summary
              <textarea
                rows={3}
                value={releaseSummary}
                onChange={(event) =>
                  setReleaseSummary(
                    event.target.value,
                  )
                }
                placeholder="A concise overview of this release."
              />
            </label>

            <div className="center-form-grid">
              <label>
                Minimum supported version
                <input
                  value={
                    releaseMinimumVersion
                  }
                  onChange={(event) =>
                    setReleaseMinimumVersion(
                      event.target.value,
                    )
                  }
                  placeholder="1.1.0"
                />
              </label>

              <label>
                Release-note title
                <input
                  value={
                    releaseNoteTitle
                  }
                  onChange={(event) =>
                    setReleaseNoteTitle(
                      event.target.value,
                    )
                  }
                  placeholder="What changed"
                />
              </label>
            </div>

            <label>
              Release notes
              <textarea
                rows={8}
                value={
                  releaseNoteBody
                }
                onChange={(event) =>
                  setReleaseNoteBody(
                    event.target.value,
                  )
                }
                placeholder={"• Improved reports\n• Fixed offline behavior\n• Added new settings"}
              />
            </label>

            <div className="center-publish-actions">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void saveRelease(
                    "draft",
                  )
                }
              >
                Save draft
              </button>

              <button
                type="button"
                className="primary"
                disabled={saving}
                onClick={() =>
                  void saveRelease(
                    "published",
                  )
                }
              >
                Publish release
              </button>
            </div>

            {notice ? (
              <div className="notice">
                {notice}
              </div>
            ) : null}
          </article>

          <article className="center-card">
            <span className="kicker">
              Release manager
            </span>
            <h3>
              Versions and release notes
            </h3>

            <div className="center-manager-list">
              {platformReleases.length ? (
                platformReleases.map(
                  (release) => {
                    const notes =
                      releaseNotesByRelease.get(
                        release.id,
                      ) ?? [];

                    return (
                      <div
                        key={release.id}
                        className="center-manager-item"
                      >
                        <div className="center-manager-heading">
                          <strong>
                            {release.version}
                            {" · "}
                            {release.title}
                          </strong>
                          <span className="center-badge">
                            {titleText(
                              release.status,
                            )}
                          </span>
                        </div>

                        {release.summary ? (
                          <p>
                            {
                              release.summary
                            }
                          </p>
                        ) : null}

                        <small>
                          {titleText(
                            release.channel,
                          )}
                          {release.minimumSupportedVersion
                            ? ` · Minimum ${release.minimumSupportedVersion}`
                            : ""}
                          {release.publishedAt
                            ? ` · ${dateText(
                                release.publishedAt,
                              )}`
                            : ""}
                        </small>

                        {notes.map(
                          (note) => (
                            <div
                              key={note.id}
                              className="center-release-note"
                            >
                              <strong>
                                {
                                  note.title
                                }
                              </strong>
                              <p>
                                {note.body}
                              </p>
                            </div>
                          ),
                        )}

                        <div className="center-manager-actions">
                          {release.status !==
                          "published" ? (
                            <button
                              type="button"
                              onClick={() =>
                                void setReleaseStatus(
                                  release,
                                  "published",
                                )
                              }
                            >
                              Publish
                            </button>
                          ) : null}

                          {release.status ===
                          "published" ? (
                            <button
                              type="button"
                              onClick={() =>
                                void setReleaseStatus(
                                  release,
                                  "withdrawn",
                                )
                              }
                            >
                              Withdraw
                            </button>
                          ) : null}

                          {release.status ===
                          "withdrawn" ? (
                            <button
                              type="button"
                              onClick={() =>
                                void setReleaseStatus(
                                  release,
                                  "draft",
                                )
                              }
                            >
                              Restore draft
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  },
                )
              ) : (
                <p>
                  No releases created yet.
                </p>
              )}
            </div>
          </article>
        </section>
      ) : null}

      {section === "updates" ? (
        <section className="center-list">
          {!isDeveloper &&
          visibleReleases.length ? (
            visibleReleases.map(
              (release) => {
                const notes =
                  releaseNotesByRelease.get(
                    release.id,
                  ) ?? [];

                return (
                  <article
                    key={`release-${release.id}`}
                    className="center-card center-release-card"
                  >
                    <header>
                      <span>
                        Product update
                      </span>
                      <small>
                        {dateText(
                          release.publishedAt ??
                            release.updatedAt ??
                            release.createdAt,
                        )}
                      </small>
                    </header>

                    <h3>
                      {release.version}
                      {" · "}
                      {release.title}
                    </h3>

                    {release.summary ? (
                      <p>
                        {release.summary}
                      </p>
                    ) : null}

                    {notes.length ? (
                      <div className="center-user-release-notes">
                        {notes.map(
                          (note) => (
                            <div
                              key={note.id}
                            >
                              <strong>
                                {
                                  note.title
                                }
                              </strong>
                              <p>
                                {note.body}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              },
            )
          ) : null}
          {announcements.length ? (
            announcements.map(
              (announcement) => {
                const receipt =
                  receiptByAnnouncement.get(
                    announcement.id,
                  );

                return (
                  <article
                    key={
                      announcement.id
                    }
                    className="center-card"
                  >
                    <header>
                      <span>
                        {announcement.type}
                      </span>
                      <small>
                        {dateText(
                          announcement.publishAt ??
                            announcement.createdAt,
                        )}
                      </small>
                    </header>

                    <h3>
                      {
                        announcement.title
                      }
                    </h3>

                    <p>
                      {announcement.body}
                    </p>

                    <footer>
                      {!isDeveloper ? (
                        receipt?.readAt ? (
                          <span className="read-state">
                            Read
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void markRead(
                                announcement,
                              )
                            }
                          >
                            Mark as read
                          </button>
                        )
                      ) : null}

                      {announcement.actionUrl ? (
                        <button
                          type="button"
                          className="primary"
                          onClick={() => {
                            if (
                              announcement
                                .actionUrl
                                ?.startsWith(
                                  "#",
                                )
                            ) {
                              navigate(
                                announcement.actionUrl.slice(
                                  1,
                                ),
                              );
                            }
                          }}
                        >
                          {announcement.actionLabel ??
                            "Open"}
                        </button>
                      ) : null}
                    </footer>
                  </article>
                );
              },
            )
          ) : (
            <div className="center-empty">
              No current announcements.
            </div>
          )}
        </section>
      ) : null}

      {false && section === "feedback" &&
      !isDeveloper ? (
        <section className="center-grid">
          <article className="center-card">
            <span className="kicker">
              Survey & feedback
            </span>
            <p style={{ fontSize: 12, opacity: 0.72 }}>
              Survey forms are not end-to-end encrypted. For private support,
              switch to Support and use the encrypted conversation screen.
            </p>
            <h3>
              Share an idea or report a
              problem
            </h3>

            <label>
              Type
              <select
                value={feedbackType}
                onChange={(event) =>
                  setFeedbackType(
                    event.target
                      .value as PlatformFeedbackType,
                  )
                }
              >
                {feedbackTypes.filter(item => item.value !== "support_request").map(
                  (item) => (
                    <option
                      key={item.value}
                      value={item.value}
                    >
                      {item.label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Subject
              <input
                value={subject}
                onChange={(event) =>
                  setSubject(
                    event.target.value,
                  )
                }
                placeholder="What is this about?"
              />
            </label>

            <label>
              Message
              <textarea
                rows={6}
                value={messageBody}
                onChange={(event) =>
                  setMessageBody(
                    event.target.value,
                  )
                }
                placeholder="Explain what happened or what you would like improved."
              />
            </label>

            {notice ? (
              <div className="notice">
                {notice}
              </div>
            ) : null}

            <button
              type="button"
              className="primary submit"
              disabled={saving}
              onClick={() =>
                void submitFeedback()
              }
            >
              {saving
                ? "Submitting…"
                : "Submit"}
            </button>
          </article>

          <article className="center-card">
            <span className="kicker">
              Your messages
            </span>
            <h3>
              Previous local feedback
            </h3>

            <div className="history">
              {feedback.length ? (
                feedback.map((item) => (
                  <div key={item.id}>
                    <strong>
                      {item.subject}
                    </strong>
                    <span>
                      {titleText(
                        item.type,
                      )}
                      {" · "}
                      {titleText(
                        item.status,
                      )}
                    </span>
                    <small>
                      {dateText(
                        item.submittedAt,
                      )}
                    </small>
                  </div>
                ))
              ) : (
                <p>
                  No previous local feedback submitted
                  yet.
                </p>
              )}
            </div>
          </article>
        </section>
      ) : null}


      {section === "feedback" ? <EleeveonSurveys isDeveloper={isDeveloper}/> : null}

      {section === "support" && !isDeveloper ? (
        <EleeveonSupportChat
          navigation={centerTabs}
          onOpenHubSettings={openHubSettings}
          mobileNavigation={mobileChatNavigation}
          isDeveloper={false}
          accountId={idOf(accountId)}
          schoolId={activeSchoolId}
          branchId={activeBranchId}
          userId={userId}
          membershipId={membershipId}
          role={role}
          schoolName={activeSchool?.name}
          branchName={activeBranch?.name}
        />
      ) : null}

      {section === "access" ? (
        <section className="center-grid">
          <article className="center-card">
            <span className="kicker">
              {isDeveloper
                ? "Current platform context"
                : "Current access"}
            </span>
            <h3>
              {isDeveloper
                ? titleText(role)
                : access?.snapshot
                    ?.source ??
                  "Workspace access"}
            </h3>

            <div className="facts">
              <div>
                <span>Status</span>
                <strong>
                  {access?.status ??
                    (isDeveloper
                      ? "Platform role"
                      : "Unknown")}
                </strong>
              </div>
              <div>
                <span>
                  Deployment
                </span>
                <strong>
                  {access?.deploymentMode ??
                    "Not resolved"}
                </strong>
              </div>
              <div>
                <span>
                  Sync policy
                </span>
                <strong>
                  {access?.syncPolicy ??
                    "Not resolved"}
                </strong>
              </div>
            </div>
          </article>

          {isDeveloper ? (
            <article className="center-card">
              <span className="kicker">
                Support cache
              </span>
              <h3>
                Local platform records
              </h3>
              <p>
                This developer view reads
                all feedback and feedback
                messages currently
                available in the local
                platform cache. Server
                visibility still depends
                on what your sync/bootstrap
                layer provides to the
                developer account.
              </p>

              <div className="facts">
                <div>
                  <span>
                    Feedback
                  </span>
                  <strong>
                    {feedback.length}
                  </strong>
                </div>

                <div>
                  <span>
                    Messages
                  </span>
                  <strong>
                    {
                      feedbackMessages.length
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    Announcements
                  </span>
                  <strong>
                    {
                      announcements.length
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    Releases
                  </span>
                  <strong>
                    {
                      platformReleases.length
                    }
                  </strong>
                </div>
              </div>
            </article>
          ) : (
            <article className="center-card">
              <span className="kicker">
                Upgrade
              </span>
              <h3>
                Add capacity or features
              </h3>
              <p>
                Upgrade controls will use
                the subscription module
                available to the account
                owner. Other roles can
                send a billing question
                from Feedback.
              </p>

              <button
                type="button"
                onClick={() => {
                  setFeedbackType(
                    "billing_question",
                  );
                  setSection("feedback");
                }}
              >
                Ask about access
              </button>
            </article>
          )}
        </section>
      ) : null}
        </div>
      </div>
    </main>
  );
}

const css = `

/* Shared scenic background for every Hub section; no chat-only overrides. */
.hub-module .center-work-area{background-image:var(--hub-scene);background-size:cover;background-position:center;background-attachment:local}
.hub-module .center-card{background:color-mix(in srgb,var(--surface,#fff) 94%,transparent)}
.hub-nav-with-settings{display:flex;align-items:center;width:100%;min-width:0;gap:5px}
.hub-nav-with-settings .center-inline-tabs{flex:1;width:auto;min-width:0}
.hub-settings-gear{flex:0 0 auto;display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--border,#dce6e8);border-radius:10px;background:var(--surface,#fff);color:var(--text,#30414f);font-size:19px;cursor:pointer}
.hub-settings-gear:hover{background:color-mix(in srgb,var(--dashboard-primary,#147d79) 9%,var(--surface,#fff))}
/* Inline navigation occupies the existing conversation-list header.
   There is no separate Center rail or phone selector row. */
.center-shell{display:block;width:100%;height:clamp(400px,calc(100dvh - 143px),1100px);min-height:0;overflow:hidden}
.center-work-area{width:100%;height:100%;min-width:0;min-height:0;overflow:hidden}
.center-work-area:has(.center-section-header){overflow-y:auto;overscroll-behavior:contain}
.center-section-header{display:flex;align-items:center;min-height:48px;margin-bottom:8px;padding:5px 9px;border:1px solid var(--border,#dce6e8);border-radius:14px;background:var(--surface,#fff)}
.center-inline-tabs{display:flex;align-items:center;min-width:0;width:100%;gap:3px;white-space:nowrap;overflow-x:auto;scrollbar-width:none;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
.center-inline-tabs::-webkit-scrollbar{display:none}
.center-inline-tabs button,.center-inline-tabs select{flex:0 0 auto;min-height:32px;padding:7px 9px;background:transparent;border:1px solid transparent;border-radius:10px;color:var(--text,#30414f);font-size:11px;font-weight:690;line-height:1.25;cursor:pointer}
.center-inline-tabs button:hover,.center-inline-tabs select:hover{background:color-mix(in srgb,var(--dashboard-primary,#147d79) 7%,var(--surface,#fff))}
.center-inline-tabs button.active{color:var(--dashboard-primary,#117e77);background:color-mix(in srgb,var(--dashboard-primary,#147d79) 12%,var(--surface,#fff));border-color:color-mix(in srgb,var(--dashboard-primary,#147d79) 18%,var(--border,#dde9e9))}
.center-inline-tabs select{max-width:68px;appearance:auto;padding-right:4px}
.center-mobile-chat-switch{max-width:78px;min-width:60px;font-size:11px;padding:7px 3px;border:1px solid var(--border,#dce6e8);border-radius:9px;background:var(--surface,#fff);color:var(--text,#30414f)}
@media(max-width:680px){
 .center-shell{height:clamp(340px,calc(100dvh - 120px),1040px)}
 .center-section-header{min-height:44px;padding:4px 7px}
 .center-inline-tabs button,.center-inline-tabs select{font-size:11px;min-height:32px;padding:7px 8px}
}
.center-module {
  width: 100%;
  min-height: 100%;
  color:
    var(--text, #111111);
}

.center-module * {
  box-sizing: border-box;
}

.center-intro {
  display: flex;
  align-items: flex-start;
  justify-content:
    space-between;
  gap: 14px;
  padding: 16px;
  border: 1px solid
    var(
      --border,
      rgba(0,0,0,.08)
    );
  border-radius: 20px;
  background:
    var(--surface, #ffffff);
}

.center-intro > div:first-child {
  min-width: 0;
}

.center-intro > div:first-child >
span,
.kicker {
  color:
    var(
      --dashboard-primary,
      var(--primary-color, #2563eb)
    );
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.center-intro h2 {
  margin: 4px 0;
  font-size:
    clamp(21px, 4vw, 30px);
  letter-spacing: -.04em;
}

.center-intro p,
.center-card p {
  margin: 0;
  color:
    var(--muted, #64748b);
  line-height: 1.55;
}

.center-workspace {
  flex: 0 0 auto;
  max-width: 240px;
  padding: 9px 11px;
  border-radius: 14px;
  background:
    var(
      --shell-section-bg,
      #f7f8fb
    );
  text-align: right;
}

.center-workspace strong,
.center-workspace span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.center-workspace strong {
  font-size: 12px;
}

.center-workspace span {
  margin-top: 2px;
  color:
    var(--muted, #64748b);
  font-size: 10px;
}

.center-tabs {
  display: flex;
  gap: 6px;
  margin: 12px 0;
  overflow-x: auto;
}

.center-tabs button {
  min-height: 38px;
  white-space: nowrap;
  border: 1px solid
    var(
      --border,
      rgba(0,0,0,.08)
    );
  border-radius: 12px;
  padding: 8px 12px;
  background:
    var(--surface, #ffffff);
  color: inherit;
  font-weight: 850;
  cursor: pointer;
}

.center-tabs button.active {
  border-color:
    var(
      --dashboard-primary,
      var(--primary-color, #2563eb)
    );
  color:
    var(
      --dashboard-primary,
      var(--primary-color, #2563eb)
    );
  background:
    color-mix(
      in srgb,
      var(
        --dashboard-primary,
        var(--primary-color, #2563eb)
      ) 8%,
      var(--surface, #ffffff)
    );
}

.center-tabs b {
  margin-left: 6px;
  padding: 1px 5px;
  border-radius: 999px;
  background:
    var(
      --dashboard-primary,
      var(--primary-color, #2563eb)
    );
  color: #fff;
  font-size: 9px;
}

.center-list {
  display: grid;
  gap: 9px;
}

.center-grid {
  display: grid;
  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );
  gap: 10px;
}

.center-card,
.center-empty {
  padding: 15px;
  border: 1px solid
    var(
      --border,
      rgba(0,0,0,.08)
    );
  border-radius: 18px;
  background:
    var(--surface, #ffffff);
}

.center-card header,
.center-card footer {
  display: flex;
  align-items: center;
  justify-content:
    space-between;
  gap: 8px;
}

.center-card header > span {
  color:
    var(
      --dashboard-primary,
      var(--primary-color, #2563eb)
    );
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.center-card header small {
  color:
    var(--muted, #64748b);
}

.center-card h3 {
  margin: 7px 0;
  font-size: 18px;
}

.center-card footer {
  justify-content: flex-end;
  margin-top: 12px;
}

.center-card button {
  min-height: 38px;
  border: 1px solid
    var(
      --border,
      rgba(0,0,0,.08)
    );
  border-radius: 11px;
  padding: 8px 11px;
  background: transparent;
  color: inherit;
  font-weight: 850;
  cursor: pointer;
}

.center-card button.primary {
  border-color: transparent;
  background:
    var(
      --dashboard-primary,
      var(--primary-color, #2563eb)
    );
  color: #fff;
}

.center-card button.submit {
  width: 100%;
  margin-top: 12px;
}

.center-card label {
  display: grid;
  gap: 5px;
  margin-top: 11px;
  font-size: 12px;
  font-weight: 800;
}

.center-card input,
.center-card select,
.center-card textarea {
  width: 100%;
  border: 1px solid
    var(
      --border,
      rgba(0,0,0,.08)
    );
  border-radius: 11px;
  padding: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
}

.notice {
  margin-top: 11px;
  padding: 9px;
  border-radius: 11px;
  background:
    color-mix(
      in srgb,
      var(
        --dashboard-primary,
        var(--primary-color, #2563eb)
      ) 8%,
      transparent
    );
  font-size: 12px;
}

.history {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}

.history > div {
  display: grid;
  gap: 2px;
  padding: 9px;
  border-radius: 12px;
  background:
    var(
      --shell-section-bg,
      #f7f8fb
    );
}

.history span,
.history small,
.read-state {
  color:
    var(--muted, #64748b);
}

.facts {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}

.facts > div {
  display: flex;
  justify-content:
    space-between;
  gap: 8px;
  padding: 9px;
  border-radius: 11px;
  background:
    var(
      --shell-section-bg,
      #f7f8fb
    );
}

.facts span {
  color:
    var(--muted, #64748b);
}

.center-empty {
  min-height: 150px;
  display: grid;
  place-items: center;
  text-align: center;
  color:
    var(--muted, #64748b);
}

@media (max-width: 720px) {
  .center-intro {
    display: grid;
  }

  .center-workspace {
    max-width: none;
    text-align: left;
  }

  .center-grid {
    grid-template-columns: 1fr;
  }
}

/* Eleeveon Hub visual hierarchy --------------------------------------- */
.hub-module {
  display: grid;
  gap: 12px;
}

.hub-overview {
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(
      135deg,
      var(--eds-surface),
      color-mix(in srgb, var(--eds-primary) 6%, var(--eds-surface))
    );
  box-shadow: var(--eds-shadow-soft);
}

.hub-overview::after {
  content: "";
  position: absolute;
  right: -60px;
  top: -90px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--eds-primary) 10%, transparent);
  pointer-events: none;
}

.hub-tabs {
  position: sticky;
  top: 0;
  z-index: 4;
  padding: 6px;
  border: 1px solid var(--eds-border);
  border-radius: var(--eds-radius-card);
  background: color-mix(in srgb, var(--eds-surface) 94%, transparent);
  backdrop-filter: blur(14px);
}

.center-card {
  background: var(--eds-card) !important;
  border-color: var(--eds-border) !important;
  box-shadow: var(--eds-shadow-soft);
}

.center-card:hover {
  border-color: var(--eds-border-strong) !important;
}


/* --------------------------------------------------------------------------
 * Developer / platform-team support workspace
 * -------------------------------------------------------------------------- */

.center-developer-summary {
  display: grid;
  grid-template-columns:
    repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.center-stat {
  padding: 12px;
  border: 1px solid
    var(--border, rgba(0,0,0,.08));
  border-radius: 15px;
  background:
    var(--surface, #ffffff);
}

.center-stat span {
  display: block;
  color:
    var(--muted, #64748b);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}

.center-stat strong {
  display: block;
  margin-top: 3px;
  font-size: 21px;
  line-height: 1;
}

.center-ticket-layout {
  display: grid;
  grid-template-columns:
    minmax(280px, .9fr)
    minmax(0, 1.35fr);
  gap: 10px;
  align-items: start;
}

.center-ticket-list,
.center-ticket-thread {
  min-width: 0;
}

.center-ticket-list {
  display: grid;
  gap: 7px;
}

.center-ticket {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid
    var(--border, rgba(0,0,0,.08));
  border-radius: 14px;
  background:
    var(--surface, #ffffff);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.center-ticket.active {
  border-color:
    var(
      --dashboard-primary,
      var(--primary-color, #2563eb)
    );
  background:
    color-mix(
      in srgb,
      var(
        --dashboard-primary,
        var(--primary-color, #2563eb)
      ) 7%,
      var(--surface, #ffffff)
    );
}

.center-ticket-top,
.center-ticket-meta,
.center-thread-heading,
.center-support-controls,
.center-message-meta {
  display: flex;
  align-items: center;
  gap: 7px;
}

.center-ticket-top,
.center-thread-heading {
  justify-content: space-between;
}

.center-ticket strong,
.center-ticket span,
.center-ticket small {
  display: block;
}

.center-ticket strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.center-ticket p {
  display: -webkit-box;
  margin: 5px 0 7px;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  color:
    var(--muted, #64748b);
  font-size: 11px;
  line-height: 1.4;
}

.center-ticket-meta {
  flex-wrap: wrap;
  color:
    var(--muted, #64748b);
  font-size: 10px;
}

.center-badge {
  display: inline-flex !important;
  align-items: center;
  width: fit-content;
  padding: 3px 6px;
  border-radius: 999px;
  background:
    var(--shell-section-bg, #f7f8fb);
  font-size: 9px !important;
  font-weight: 900;
  text-transform: uppercase;
}

.center-badge.priority-high,
.center-badge.priority-urgent {
  background:
    color-mix(
      in srgb,
      #dc2626 10%,
      var(--surface, #ffffff)
    );
}

.center-ticket-thread {
  padding: 15px;
  border: 1px solid
    var(--border, rgba(0,0,0,.08));
  border-radius: 18px;
  background:
    var(--surface, #ffffff);
}

.center-thread-heading h3 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 18px;
}

.center-thread-copy {
  margin: 10px 0 0;
  padding: 12px;
  border-radius: 13px;
  background:
    var(--shell-section-bg, #f7f8fb);
  white-space: pre-wrap;
}

.center-support-context {
  display: grid;
  grid-template-columns:
    repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.center-support-context > div {
  min-width: 0;
  padding: 9px;
  border-radius: 11px;
  background:
    var(--shell-section-bg, #f7f8fb);
}

.center-support-context span,
.center-support-context strong {
  display: block;
}

.center-support-context span {
  color:
    var(--muted, #64748b);
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
}

.center-support-context strong {
  margin-top: 2px;
  overflow-wrap: anywhere;
  font-size: 11px;
}

.center-support-controls {
  flex-wrap: wrap;
  margin-top: 11px;
}

.center-support-controls label {
  flex: 1 1 150px;
  margin: 0;
}

.center-thread-messages {
  display: grid;
  gap: 7px;
  margin-top: 12px;
}

.center-message {
  max-width: 88%;
  padding: 9px 10px;
  border-radius: 13px;
  background:
    var(--shell-section-bg, #f7f8fb);
}

.center-message.platform {
  margin-left: auto;
  background:
    color-mix(
      in srgb,
      var(
        --dashboard-primary,
        var(--primary-color, #2563eb)
      ) 9%,
      var(--surface, #ffffff)
    );
}

.center-message p {
  margin: 0;
  white-space: pre-wrap;
  color: inherit;
  font-size: 12px;
}

.center-message-meta {
  justify-content: space-between;
  margin-top: 5px;
  color:
    var(--muted, #64748b);
  font-size: 9px;
}

.center-reply-box {
  margin-top: 12px;
}

.center-reply-box textarea {
  min-height: 96px;
  resize: vertical;
}

.center-developer-empty {
  padding: 24px 14px;
  border: 1px dashed
    var(--border, rgba(0,0,0,.12));
  border-radius: 16px;
  color:
    var(--muted, #64748b);
  text-align: center;
}

@media (max-width: 920px) {
  .center-developer-summary {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }

  .center-ticket-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .center-developer-summary {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }

  .center-support-context {
    grid-template-columns: 1fr;
  }

  .center-message {
    max-width: 95%;
  }
}



/* --------------------------------------------------------------------------
 * Developer / Platform Team outbound publishing
 * -------------------------------------------------------------------------- */

.center-publisher-layout {
  display: grid;
  grid-template-columns:
    minmax(0, 1.05fr)
    minmax(300px, .95fr);
  gap: 10px;
  align-items: start;
}

.center-form-grid {
  display: grid;
  grid-template-columns:
    repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.center-audience {
  margin-top: 12px;
  padding: 11px;
  border-radius: 13px;
  background:
    var(--shell-section-bg, #f7f8fb);
}

.center-audience > span {
  display: block;
  font-size: 12px;
  font-weight: 900;
}

.center-audience > small {
  display: block;
  margin-top: 2px;
  color:
    var(--muted, #64748b);
}

.center-role-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;
}

.center-check {
  display: inline-flex !important;
  align-items: center;
  gap: 6px !important;
  margin: 0 !important;
  padding: 7px 9px;
  border: 1px solid
    var(--border, rgba(0,0,0,.08));
  border-radius: 999px;
  background:
    var(--surface, #ffffff);
  cursor: pointer;
  font-size: 10px !important;
}

.center-check input {
  width: auto !important;
  margin: 0;
  padding: 0 !important;
}

.center-inline-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 11px;
}

.center-publish-actions,
.center-manager-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 12px;
}

.center-manager-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.center-manager-item {
  padding: 11px;
  border: 1px solid
    var(--border, rgba(0,0,0,.08));
  border-radius: 14px;
  background:
    var(--shell-section-bg, #f7f8fb);
}

.center-manager-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.center-manager-heading strong {
  min-width: 0;
  font-size: 13px;
}

.center-manager-item > p {
  margin-top: 6px;
  white-space: pre-wrap;
  font-size: 11px;
}

.center-manager-item > small {
  display: block;
  margin-top: 7px;
  color:
    var(--muted, #64748b);
  font-size: 9px;
}

.center-release-note {
  margin-top: 8px;
  padding: 9px;
  border-radius: 11px;
  background:
    var(--surface, #ffffff);
}

.center-release-note strong {
  font-size: 11px;
}

.center-release-note p {
  margin-top: 4px;
  white-space: pre-wrap;
  font-size: 10px;
}

.center-release-card {
  border-color:
    color-mix(
      in srgb,
      var(
        --dashboard-primary,
        var(--primary-color, #2563eb)
      ) 22%,
      var(--border, rgba(0,0,0,.08))
    );
}

.center-user-release-notes {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}

.center-user-release-notes > div {
  padding: 9px 10px;
  border-radius: 11px;
  background:
    var(--shell-section-bg, #f7f8fb);
}

.center-user-release-notes strong {
  font-size: 11px;
}

.center-user-release-notes p {
  margin-top: 3px;
  white-space: pre-wrap;
  font-size: 11px;
}

/* Shared Hub atmosphere: every Hub section should feel like its own place. */
.hub-module {
  position:relative;
  overflow:hidden;
  padding:5px;
  border-radius:21px;
  background:linear-gradient(115deg,rgba(5,37,43,.25),rgba(6,43,39,.08)),url('/hub-pier.png') center / cover no-repeat,#b9dcd6;
  color:#23413d;
}
.hub-module .center-shell {border-radius:16px}
.hub-module .center-work-area:has(.center-section-header){padding:10px 11px 15px}
.hub-module .center-section-header{
  background:rgba(251,255,252,.87);
  border:1px solid rgba(255,255,255,.75);
  backdrop-filter:blur(14px);
  -webkit-backdrop-filter:blur(14px);
  box-shadow:0 6px 24px rgba(8,52,46,.10);
}
.hub-module .center-inline-tabs button,.hub-module .center-inline-tabs select{color:#28514b}
.hub-module .center-inline-tabs button.active{
  color:#0d685c;
  background:rgba(181,229,215,.53);
  border-color:rgba(30,118,103,.16);
}
.hub-module .center-card,.hub-module .center-empty,.hub-module .center-stat{
  background:rgba(249,254,250,.94)!important;
  border-color:rgba(255,255,255,.80)!important;
  box-shadow:0 5px 24px rgba(0,43,39,.12);
  backdrop-filter:blur(13px);
  -webkit-backdrop-filter:blur(13px);
}
@media(max-width:680px){.hub-module{padding:0;border-radius:14px}.hub-module .center-work-area:has(.center-section-header){padding:7px}}

@media (max-width: 900px) {
  .center-publisher-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .center-form-grid {
    grid-template-columns: 1fr;
  }

  .center-publish-actions,
  .center-manager-actions {
    justify-content: stretch;
  }

  .center-publish-actions button,
  .center-manager-actions button {
    flex: 1 1 auto;
  }
}

`;
