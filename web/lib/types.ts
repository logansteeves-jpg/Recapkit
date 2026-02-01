// web/lib/types.ts
// Shared, app-wide types to prevent drift across UI + API + libs.

export type EmailType =
  | "followUp"
  | "question"
  | "actionComplete"
  | "actionClarification"
  | "concern";

export type EmailTone = "professional" | "warm" | "friendlyProfessional" | "casual";

export type SessionMode = "followUp" | "current" | "past";

export type FollowUpType =
  | "Email"
  | "Phone Call"
  | "In-Person Meeting"
  | "Video Call"
  | "Text Message"
  | "Other";

export type MeetingResult =
  | "Completed"
  | "No Show"
  | "Rescheduled"
  | "Cancelled"
  | "Blocked"
  | "Pending";

export type HighlightTag = "None" | "Email" | "Call" | "Meeting" | "Urgent" | "Other";