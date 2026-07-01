import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
    children: ReactNode;
};

type ErrorBoundaryState = {
    error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("ErrorBoundary caught:", error, info.componentStack);
    }

    render() {
        if (this.state.error) {
            return (
                <div className="flex min-h-screen items-center justify-center bg-[#070b14] p-6" role="alert">
                    <div className="surface-card trade-card text-center">
                        <div className="mb-4 text-6xl" aria-hidden="true">⚠</div>
                        <h1 className="mb-2 text-2xl font-black text-primary">Something went wrong</h1>
                        <p className="mb-6 text-sm text-secondary">{this.state.error.message}</p>
                        <div className="flex items-center justify-center gap-3">
                            <button
                                type="button"
                                onClick={() => this.setState({ error: null })}
                                className="rounded-lg surface-elevated px-5 py-2.5 text-sm font-bold text-secondary transition duration-150 hover:bg-white/[0.1]"
                            >
                                Try again
                            </button>
                            <button
                                type="button"
                                onClick={() => window.location.reload()}
                                className="primary-action inline-flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 via-fuchsia-500 to-blue-500 px-6 font-black text-white shadow-glow transition duration-150 hover:scale-[1.01]"
                            >
                                Reload page
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
