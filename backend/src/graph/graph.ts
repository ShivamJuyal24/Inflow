import { StateGraph, START, END } from "@langchain/langgraph";

import { StateAnnotation } from "./state";
import {
  fetchNode,
  persistNode,
  classifyNode,
  actionNode,
  routeActions,
  draftNode,
  meetingNode,
} from "./nodes";

const workflow = new StateGraph(StateAnnotation)
  .addNode("fetch", fetchNode)
  .addNode("persist", persistNode)
  .addNode("classify", classifyNode)
  .addNode("action", actionNode)
  .addNode("draftWorkFlow", draftNode)
  .addNode("meetingWorkFlow", meetingNode)

  .addEdge(START, "fetch")
  .addEdge("fetch", "persist")
  .addEdge("persist", "classify")
  .addEdge("classify", "action")

  .addConditionalEdges(
    "action",
    routeActions,
    ["draftWorkFlow", "meetingWorkFlow", END]
  )

  .addEdge("draftWorkFlow", END)
  .addEdge("meetingWorkFlow", END);

export const graph = workflow.compile();