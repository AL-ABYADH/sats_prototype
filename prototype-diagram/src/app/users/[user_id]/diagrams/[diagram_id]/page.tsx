// src/app/users/[user_id]/diagrams/[diagram_id]/page.tsx

import { ReactFlowProvider } from "@xyflow/react";
import { DnDProvider } from "./hooks/useDnD";
import Canvas from "./components/Canvas";
import { getDiagramDetails } from "@/server/diagrams";
import { SocketProvider } from "./hooks/useDiagramSocket";
import { ReactionProvider } from "./hooks/useReaction";
import { UserColorsProvider } from "./hooks/useUserColors";

export default async function Page({
                                       params,
                                   }: {
    params: Promise<{diagram_id: string; user_id: string}>;
}) {
    const { diagram_id, user_id } = await params;
    const diagram: Diagram = await getDiagramDetails(diagram_id);

    return (
        <ReactFlowProvider>
            <SocketProvider url={process.env.APP_URL || 'http://localhost:8000'}>
                <UserColorsProvider>
                    <DnDProvider>
                        <ReactionProvider>
                            <Canvas
                                initialDiagram={JSON.parse(diagram.json ?? "{}")}
                                diagramId={diagram_id}
                                userId={user_id}
                            />
                        </ReactionProvider>
                    </DnDProvider>
                </UserColorsProvider>
            </SocketProvider>
        </ReactFlowProvider>
    );
}