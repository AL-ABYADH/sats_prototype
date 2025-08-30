// src/app/users/[user_id]/diagrams/[diagram_id]/components/ReactionSelector.tsx

import React from "react";

type Props = {
    setReaction: (reaction: string) => void;
};

export default function ReactionSelector({ setReaction }: Props) {
    // Fix: Added additional reactions and improved styling
    return (
        <div
            className="reaction-selector absolute bottom-20 left-0 right-0 mx-auto w-fit transform rounded-full bg-white/95 px-3 py-2 backdrop-blur-sm shadow-lg"
            onPointerMove={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            <ReactionButton reaction="👍" onSelect={setReaction} />
            <ReactionButton reaction="❤️" onSelect={setReaction} />
            <ReactionButton reaction="🔥" onSelect={setReaction} />
            <ReactionButton reaction="😍" onSelect={setReaction} />
            <ReactionButton reaction="👀" onSelect={setReaction} />
            <ReactionButton reaction="😱" onSelect={setReaction} />
            <ReactionButton reaction="🙁" onSelect={setReaction} />
            <ReactionButton reaction="👏" onSelect={setReaction} />
        </div>
    );
}

function ReactionButton({
                            reaction,
                            onSelect,
                        }: {
    reaction: string;
    onSelect: (reaction: string) => void;
}) {
    return (
        <button
            className="reaction-button transform select-none p-2 text-xl transition-transform hover:scale-150 focus:scale-150 focus:outline-none"
            onPointerDown={(e) => {
                e.stopPropagation(); // Fix: Prevent event propagation
                onSelect(reaction);
            }}
        >
            {reaction}
        </button>
    );
}