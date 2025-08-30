// 1. First, let's fix the useReaction.tsx hook for proper type definitions and state management

// src/app/users/[user_id]/diagrams/[diagram_id]/hooks/useReaction.tsx
"use client";

import {
    createContext,
    useContext,
    useState,
    Dispatch,
    SetStateAction,
    ReactNode,
} from "react";

export enum CursorMode {
    Hidden,
    ReactionSelector,
    Reaction,
}

export type CursorState =
    | {
    mode: CursorMode.Hidden;
}
    | {
    mode: CursorMode.ReactionSelector;
}
    | {
    mode: CursorMode.Reaction;
    reaction: string;
    isPressed: boolean;
};

// Fix: Improved Point type with proper structure
export type Point = {
    screen?: { x: number; y: number };
    flow?: { x: number; y: number };
    viewport?: { zoom: number; x: number; y: number };
};

// Fix: Added type safety to Reaction object
export type Reaction = {
    value: string;
    timestamp: number;
    point: Point;
    userId?: string; // Track who sent the reaction
};

type ReactionContextType = {
    cursorState: CursorState;
    setCursorState: Dispatch<SetStateAction<CursorState>>;
    reactions: Reaction[];
    setReactions: Dispatch<SetStateAction<Reaction[]>>;
};

const ReactionContext = createContext<ReactionContextType | null>(null);

export function ReactionProvider({ children }: { children: ReactNode }) {
    const [cursorState, setCursorState] = useState<CursorState>({
        mode: CursorMode.Hidden,
    });
    const [reactions, setReactions] = useState<Reaction[]>([]);

    return (
        <ReactionContext.Provider value={{ cursorState, setCursorState, reactions, setReactions }}>
            {children}
        </ReactionContext.Provider>
    );
}

export function useReaction() {
    const context = useContext(ReactionContext);
    if (!context) {
        throw new Error("useReaction must be used within a ReactionProvider");
    }
    return context;
}