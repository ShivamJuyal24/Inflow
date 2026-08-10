import { graph } from "./graph";

async function main(){
    const result = await graph.invoke({
        email: null,
        category: null,
        draft: null,
        calendarSlots: [],
        approvalStatus: null,
    });

    console.log("Final state:");
    console.log(result);
}

main().catch((error)=>{
    console.error("Graph execution failed:");
    console.error(error);
})
