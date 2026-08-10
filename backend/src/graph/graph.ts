import { StateGraph, START, END } from "@langchain/langgraph";

import { StateAnnotation } from "./state";
import { fetchNode,classifyNode,routeNode } from "./nodes";

const workflow = new StateGraph(StateAnnotation)
.addNode("fetch", fetchNode)
.addNode("classify", classifyNode)
.addNode("route", routeNode)
.addEdge(START, "fetch")
.addEdge("fetch","classify")
.addEdge("classify", "route")
.addEdge("route", END)

export const graph = workflow.compile();