import { LiquidityCard } from "../components/LiquidityCard";
import { useSearchParams } from "react-router-dom";

export function LiquidityPage() {
    const [searchParams] = useSearchParams();
    const mode = searchParams.get("mode") === "remove" ? "remove" : "add";

    return (
        <div className="flex min-h-[calc(100vh-5rem)] min-w-0 w-full items-center justify-center px-4 py-8 sm:min-h-[calc(100vh-5.5rem)] sm:px-6">
            <LiquidityCard defaultMode={mode} />
        </div>
    );
}
