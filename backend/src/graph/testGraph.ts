import { graph } from "./graph";

async function main() {
  const result = await graph.invoke({
    emails: [],
    classification: [
      {
        messageId: "1",
        category: "REQUIRES_REPLY",
        reason: "The sender expects a response.",
        suggested_action: "Draft a reply.",
      },
      {
        messageId: "2",
        category: "MEETING",
        reason: "The email is about scheduling a meeting.",
        suggested_action: "Analyze the meeting details.",
      },
    ],
    actions: [
      {
        messageId: "1",
        type: "DRAFT_REPLY",
        status: "PENDING",
      },
      {
        messageId: "2",
        type: "ANALYZE_MEETING",
        status: "PENDING",
      },
    ],
    drafts: [],
    calendarSlots: [],
    approvalStatus: null,
  });

  console.log("Final state:");

  console.log("\nClassifications:");
  console.dir(result.classification, { depth: null });

  console.log("\nActions:");
  console.dir(result.actions, { depth: null });

  console.log("\nDrafts:");
  console.dir(result.drafts, { depth: null });

  console.log("\nCalendar slots:");
  console.log(result.calendarSlots);

  console.log("\nApproval status:");
  console.log(result.approvalStatus);
}

main().catch((error) => {
  console.error("Graph execution failed:");
  console.error(error);
});