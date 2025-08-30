// src/app/users/[user_id]/diagrams/[diagram_id]/components/Cursor.tsx

import React from "react";

type Props = {
    color: string;
    x: number;
    y: number;
    username?: string;
};

export default function Cursor({ color, x, y, username }: Props) {
    return (
        <div
            className="cursor-element"
            style={{
                transform: `translateX(${x}px) translateY(${y}px)`,
                zIndex: 9999,
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'none'
            }}
        >
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M5.5 3.5L18.5 18.5L11.5 19.5L9.5 22.5L5.5 3.5Z"
                    fill={color}
                    stroke="white"
                    strokeWidth="1.5"
                />
            </svg>

            {username && (
                <div
                    className="username-tooltip"
                    style={{
                        position: 'absolute',
                        left: '20px',
                        top: '10px',
                        backgroundColor: color,
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        whiteSpace: 'nowrap',
                        boxShadow: '0px 2px 4px rgba(0,0,0,0.2)',
                        opacity: 1 // جعل التلميح دائماً مرئياً لتحسين تجربة المستخدم
                    }}
                >
                    {username}
                </div>
            )}
        </div>
    );
}