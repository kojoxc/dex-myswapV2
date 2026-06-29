type SwapActionButtonProps = {
    label: string;
    disabled: boolean;
    loading: boolean;
    onClick: () => void;
};

export function SwapActionButton({ label, disabled, loading, onClick }: SwapActionButtonProps) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="flex w-full items-center justify-center gap-2 rounded-[1.25rem] bg-gradient-to-r from-pink-500 via-fuchsia-500 to-blue-500 px-5 py-4 text-base font-black text-white shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:text-slate-400 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
        >
            {loading ? <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
            {label}
        </button>
    );
}
