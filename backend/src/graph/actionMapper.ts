import type { EmailClassification } from "../types/classification";
import type { EmailAction, ActionType } from "../types/action";

export function mapClassificationToAction(
  classification: EmailClassification
): EmailAction {
  let type: ActionType;

  switch (classification.category) {
    case "SPAM":
    case "LOW_PRIORITY":
    case "INFORMATIONAL":
      type = "STORE";
      break;

    case "IMPORTANT":
      type = "REVIEW";
      break;

    case "REQUIRES_REPLY":
      type = "DRAFT_REPLY";
      break;

    case "MEETING":
      type = "ANALYZE_MEETING";
      break;
  }

  return {
    messageId: classification.messageId,
    type,
    // STORE is complete as soon as persistNode has saved the email.
    status: type === "STORE" ? "COMPLETED" : "PENDING",
  };
}
