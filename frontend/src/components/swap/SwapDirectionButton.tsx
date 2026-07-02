import { useState } from "react";

type SwapDirectionButtonProps = {
    disabled?: boolean;
    onClick: () => void;
};

function SwapIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="swap-icon">
            <path d="M7 2v11m-5-4 5 4 5-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 18V7m5 4-5-4-5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function SwapDirectionButton({ disabled, onClick }: SwapDirectionButtonProps) {
    const [animating, setAnimating] = useState(false);

    function handleClick() {
        onClick();
        setAnimating(true);
    }

    return (
        <button
            type="button"
            aria-label="Switch tokens"
            disabled={disabled}
            onClick={handleClick}
            className={`token-switch-button${animating ? " is-animating" : ""}`}
            onAnimationEnd={() => setAnimating(false)}
        >
            <SwapIcon />
        </button>
    );
}
