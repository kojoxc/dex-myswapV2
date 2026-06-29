type SwapDirectionButtonProps = {
    disabled?: boolean;
    onClick: () => void;
};

export function SwapDirectionButton({ disabled, onClick }: SwapDirectionButtonProps) {
    return (
        <div className="relative z-10 -my-3 flex min-w-0 max-w-full justify-center">
            <button
                type="button"
                aria-label="Switch pay and receive tokens"
                disabled={disabled}
                onClick={onClick}
                className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-[#101624] text-lg font-black text-slate-200 shadow-xl transition hover:scale-105 hover:border-pink-300/50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
            >
                ↓
            </button>
        </div>
    );
}
