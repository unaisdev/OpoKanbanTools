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
  count: string | null;
  userCount: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
};

export type SentryPublishResult = {
  resolved: boolean;
  assigned: boolean;
  commented: boolean;
  assigneeName: string | null;
  permalink: string;
  errors: string[];
};
