// src/app/users/[user_id]/diagrams/[diagram_id]/components/FlyingReaction.tsx

import React from "react";
import "../styles/reactions.css";
import { Point } from "../hooks/useReaction";

type Props = {
    point: Point;
    timestamp: number;
    value: string;
};

export default function FlyingReaction({ point, timestamp, value }: Props) {
    // استخراج إحداثيات الشاشة مع القيم الافتراضية
    let x = 0, y = 0;

    if (point.screen) {
        x = point.screen.x;
        y = point.screen.y;
    } else if (point.flow) {
        // استخدام إحداثيات التدفق كحل بديل إذا كانت متوفرة
        x = point.flow.x;
        y = point.flow.y;
    }

    // إنشاء متغير التحريك بناءً على الطابع الزمني
    const animationVariant = Math.floor(timestamp % 3);

    return (
        <div
            className="flying-reaction pointer-events-none absolute select-none"
            style={{
                left: x,
                top: y,
                zIndex: 9000,
                filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.3))",
            }}
        >
            <div
                className="disappear text-2xl"
                style={{
                    animation: `goUp${animationVariant} 2s, fadeOut 2s`,
                }}
            >
                <div
                    style={{
                        animation: `leftRight${animationVariant} 0.5s alternate infinite ease-in-out`,
                        transform: "translate(-50%, -50%)",
                    }}
                >
                    {value}
                </div>
            </div>
        </div>
    );
}