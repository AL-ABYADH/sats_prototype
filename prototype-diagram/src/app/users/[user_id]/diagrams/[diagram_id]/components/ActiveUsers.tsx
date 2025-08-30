// src/app/users/[user_id]/diagrams/[diagram_id]/components/ActiveUsers.tsx

import React, { useEffect, useState } from "react";
import { useDiagramSocket } from "../hooks/useDiagramSocket";
import { useUserColors } from "../hooks/useUserColors";

type ActiveUser = {
    id: string;
    name: string;
    email?: string;
    color?: string;
};

export default function ActiveUsers() {
    const socket = useDiagramSocket();
    const [users, setUsers] = useState<ActiveUser[]>([]);
    const { getUserColor } = useUserColors();

    useEffect(() => {
        if (!socket) return;

        const handleActiveUsers = (data: { users: ActiveUser[] }) => {
            setUsers(data.users);
        };

        socket.on("active_users", handleActiveUsers);

        // طلب قائمة المستخدمين النشطين عند تحميل المكون
        socket.emit("get_active_users");

        return () => {
            socket.off("active_users", handleActiveUsers);
        };
    }, [socket]);

    if (users.length === 0) return null;

    return (
        <div className="active-users-wrapper">
            <div className="active-users-container">
                {users.map((user) => (
                    <div
                        key={user.id}
                        className="active-user-avatar"
                        style={{
                            backgroundColor: user.color || getUserColor(user.id),
                            zIndex: 1000,
                        }}
                        title={user.name}
                    >
                        {user.name.charAt(0).toUpperCase()}
                    </div>
                ))}
            </div>
        </div>
    );
}