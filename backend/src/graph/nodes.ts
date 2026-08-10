import { EmailTriageState } from "./state";

export async function fetchNode(
    state: EmailTriageState
): Promise<Partial<EmailTriageState>>{
    console.log("fetch node running");

    return {
        email:"This is a test email"
    };
}

export async function classifyNode(
    state: EmailTriageState
): Promise<Partial<EmailTriageState>>{
    console.log("Classify node running");
    console.log("Email received by classifier:", state.email);
    return {
        category: "test"
    };
}

export async function routeNode(
    state: EmailTriageState
): Promise<Partial<EmailTriageState>>{
    console.log("Route node running");
    console.log("Category received by router:", state.category);
    return {};
}
