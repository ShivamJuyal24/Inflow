import { routeActions } from "./nodes";
import type { EmailTriageState } from "./state";

function testRoute(name: string, actions: EmailTriageState["actions"]) {
  const result = routeActions({
    emails: [],
    classification: [],
    actions,
    draft: null,
    calendarSlots: [],
    approvalStatus: null,
  });

  console.log(`\n${name}`);
  console.log("Actions:", actions);
  console.log("Destinations:", result);
}

testRoute("Test 1 — Only STORE", [
  {
    messageId: "1",
    type: "STORE",
    status: "PENDING",
  },
]);

testRoute("Test 2 — DRAFT_REPLY", [
  {
    messageId: "2",
    type: "DRAFT_REPLY",
    status: "PENDING",
  },
]);

testRoute("Test 3 — ANALYZE_MEETING", [
  {
    messageId: "3",
    type: "ANALYZE_MEETING",
    status: "PENDING",
  },
]);

testRoute("Test 4 — DRAFT + MEETING", [
  {
    messageId: "4",
    type: "DRAFT_REPLY",
    status: "PENDING",
  },
  {
    messageId: "5",
    type: "ANALYZE_MEETING",
    status: "PENDING",
  },
]);