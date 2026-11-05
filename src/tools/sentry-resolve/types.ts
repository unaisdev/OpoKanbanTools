export type SentryIssueDetails = {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  status: string;
  projectSlug: string;
  projectName: string;
  permalink: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
  /** Present when the issue is assigned to a user (not a team). */
  assigneeUserId: string | null;
  count: string | null;
  userCount: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
};

export type SentryMe = {
  id: string;
  name: string | null;
  email: string | null;
};

export type SentryExistingComment = {
  id: string;
  text: string;
  dateCreated: string | null;
};

export type SentryFindCommentResult = {
  found: boolean;
  comment: SentryExistingComment | null;
};

export type SentryActionResult = {
  ok: boolean;
  /** True when the issue was already in the desired state (no write needed). */
  already?: boolean;
  error?: string;
  status?: string;
  permalink?: string;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  assigneeUserId?: string | null;
  existingComment?: SentryExistingComment | null;
};
