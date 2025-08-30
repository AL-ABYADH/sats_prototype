// src/app/users/[user_id]/diagrams/[diagram_id]/components/LiveCursors.tsx

import React, { useEffect, useState } from "react";
import { useDiagramSocket } from "../hooks/useDiagramSocket";
import { useUserColors } from "../hooks/useUserColors";
import Cursor from "./Cursor";

type CursorData = {
    screen: { x: number; y: number };
    username?: string;
};

export default function LiveCursors() {
    const socket = useDiagramSocket();
    const [cursors, setCursors] = useState<Record<string, CursorData>>({});
    const { getUserColor } = useUserColors();

    useEffect(() => {
        if (!socket) return;

        const handleCursorUpdate = (data: any) => {
            const { userId, cursor, username } = data;

            if (!cursor) {
                setCursors((prev) => {
                    const newCursors = { ...prev };
                    delete newCursors[userId];
                    return newCursors;
                });
                return;
            }

            setCursors((prev) => ({
                ...prev,
                [userId]: {
                    ...cursor,
                    username
                }
            }));
        };

        const handleUserDisconnect = (data: any) => {
            const { userId } = data;
            setCursors((prev) => {
                const newCursors = { ...prev };
                delete newCursors[userId];
                return newCursors;
            });
        };

        socket.on("cursor_update", handleCursorUpdate);
        socket.on("user_disconnected", handleUserDisconnect);

        return () => {
            socket.off("cursor_update", handleCursorUpdate);
            socket.off("user_disconnected", handleUserDisconnect);
        };
    }, [socket]);

    return (
        <div className="live-cursors-container">
            {Object.entries(cursors).map(([userId, cursorData]) => (
                <Cursor
                    key={userId}
                    color={getUserColor(userId)}
                    x={cursorData.screen.x}
                    y={cursorData.screen.y}
                    username={cursorData.username}
                />
            ))}
        </div>
    );
}