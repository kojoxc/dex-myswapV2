type SwapDirectionButtonProps = {
    disabled?: boolean;
    onClick: () => void;
};

function ArrowUpDownIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M7 3v12m0 0-3.5-3.5M7 15l3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 17V5m0 0L9.5 8.5M13 5l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function SwapDirectionButton({ disabled, onClick }: SwapDirectionButtonProps) {
    return (
        <button
            type="button"
            aria-label="Switch tokens"
            disabled={disabled}
            onClick={onClick}
            className="token-switch-button"
        >
            <ArrowUpDownIcon />
        </button>
    );
}
