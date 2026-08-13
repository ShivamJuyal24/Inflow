import { graph } from "../graph/graph";

async function main() {
  console.log("🚀 Starting email triage agent...\n");

  const result = await graph.invoke({
    emails: [],
    classification: [],
    draft: null,
    calendarSlots: [],
    approvalStatus: null,
  });

  console.log("\n🎯 Final state:");

  console.dir(result, {
    depth: 2,
  });
}

main().catch((error) => {
  console.error("Graph failed:");
  console.error(error);
});