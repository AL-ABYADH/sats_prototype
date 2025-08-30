// src/app/users/[user_id]/diagrams/[diagram_id]/hooks/useUserColors.tsx
"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useDiagramSocket } from "./useDiagramSocket";

// مجموعة ألوان متناسقة
export const COLORS = [
    "#3B82F6", // أزرق
    "#F59E0B", // برتقالي
    "#10B981", // أخضر
    "#8B5CF6", // بنفسجي
    "#EC4899", // وردي
    "#06B6D4", // أزرق فاتح
    "#F43F5E", // أحمر
    "#84CC16", // أخضر ليموني
    "#6366F1", // أرجواني
];

type UserColorsContextType = {
    getUserColor: (userId: string) => string;
    userColors: Record<string, string>;
};

const UserColorsContext = createContext<UserColorsContextType | null>(null);

export function UserColorsProvider({ children }: { children: React.ReactNode }) {
    const [userColors, setUserColors] = useState<Record<string, string>>({});
    const socket = useDiagramSocket();

    useEffect(() => {
        if (!socket) return;

        // استمع إلى أحداث انضمام المستخدمين
        const handleUserJoined = (data: any) => {
            const { userId, color } = data;
            if (userId && color) {
                setUserColors((prev) => ({ ...prev, [userId]: color }));
            }
        };

        // استمع إلى تحديثات المستخدمين النشطين
        const handleActiveUsers = (data: any) => {
            const { users } = data;
            if (Array.isArray(users)) {
                const newColors: Record<string, string> = {};
                users.forEach((user) => {
                    if (user.id && user.color) {
                        newColors[user.id] = user.color;
                    }
                });
                setUserColors(newColors);
            }
        };

        socket.on("user_joined", handleUserJoined);
        socket.on("active_users", handleActiveUsers);

        return () => {
            socket.off("user_joined", handleUserJoined);
            socket.off("active_users", handleActiveUsers);
        };
    }, [socket]);

    // دالة للحصول على لون المستخدم
    const getUserColor = (userId: string) => {
        return userColors[userId] || COLORS[Object.keys(userColors).length % COLORS.length];
    };

    return (
        <UserColorsContext.Provider value={{ getUserColor, userColors }}>
            {children}
        </UserColorsContext.Provider>
    );
}

export function useUserColors() {
    const context = useContext(UserColorsContext);
    if (!context) {
        throw new Error("useUserColors must be used within a UserColorsProvider");
    }
    return context;
}