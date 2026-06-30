type SkeletonProps = {
    className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
    return <div className={`animate-pulse rounded-full bg-white/[0.06] ${className}`} />;
}
