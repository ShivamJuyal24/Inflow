export type EmailCategory =
  | "SPAM"
  | "LOW_PRIORITY"
  | "INFORMATIONAL"
  | "REQUIRES_REPLY"
  | "MEETING"
  | "IMPORTANT";

export type InboxEmail = {
  id: string;
  message_id: string;
  thread_id: string | null;
  from_email: string;
  to_email: string | null;
  subject: string | null;
  category: EmailCategory | null;
  classification_reason: string | null;
  suggested_action: string | null;
  received_at: string;
};

export type Email = InboxEmail & {
  body: string;
};

export type EmailListResponse = {
  emails: InboxEmail[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type EmailDetailResponse = {
  email: Email;
};