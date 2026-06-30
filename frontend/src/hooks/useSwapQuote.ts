import { useEffect, useMemo, useState } from "react";
import { type Address, formatUnits, isAddress, parseUnits } from "viem";
import { usePublicClient } from "wagmi";

import { routerAbi } from "../abis";
import { isNativeAddress } from "../lib/tokenRegistry";
import type { TokenInfo } from "../types";

export type RouteInfo = {
    path: Address[];
    input: bigint;
    output: bigint;
    label: string;
};

export type SwapQuoteMode = "exactIn" | "exactOut";

type UseSwapQuoteResult = {
    amountIn?: bigint;
    amountOut?: bigint;
    amountOutMin?: bigint;
    amountInMax?: bigint;
    rate?: string;
    path?: Address[];
    routeLabel?: string;
    routes: RouteInfo[];
    selectedRouteIndex: number;
    setSelectedRouteIndex: (index: number) => void;
    refetch: () => void;
    updatedAt?: number;
    isLoading: boolean;
    error?: string;
};

export function useSwapQuote(args: {
    routerAddress: string;
    tokenIn?: TokenInfo;
    tokenOut?: TokenInfo;
    intermediateToken?: TokenInfo;
    amount: string;
    slippageBps: number;
    quoteMode?: SwapQuoteMode;
}): UseSwapQuoteResult {
    const publicClient = usePublicClient();
    const [routes, setRoutes] = useState<RouteInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string>();
    const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
    const [updatedAt, setUpdatedAt] = useState<number>();
    const [refreshNonce, setRefreshNonce] = useState(0);

    const quoteMode = args.quoteMode ?? "exactIn";

    const parsedAmount = useMemo(() => {
        const token = quoteMode === "exactOut" ? args.tokenOut : args.tokenIn;
        if (!token || !args.amount || Number(args.amount) <= 0) return undefined;
        try {
            return parseUnits(args.amount, token.decimals);
        } catch {
            return undefined;
        }
    }, [args.amount, args.tokenIn, args.tokenOut, quoteMode]);

    useEffect(() => {
        let cancelled = false;

        async function loadQuote() {
            setRoutes([]);
            setError(undefined);
            setSelectedRouteIndex(0);
            setUpdatedAt(undefined);

            if (!publicClient || !isAddress(args.routerAddress) || !args.tokenIn || !args.tokenOut || !parsedAmount || parsedAmount <= 0n) {
                setIsLoading(false);
                return;
            }

            setIsLoading(true);

            try {
                async function quotePath(nextPath: Address[]) {
                    if (quoteMode === "exactOut") {
                        const amounts = await publicClient!.readContract({
                            address: args.routerAddress as Address,
                            abi: routerAbi,
                            functionName: "getAmountsIn",
                            args: [parsedAmount!, nextPath],
                        });

                        return { nextPath, input: amounts[0], output: parsedAmount! };
                    }

                    const amounts = await publicClient!.readContract({
                        address: args.routerAddress as Address,
                        abi: routerAbi,
                        functionName: "getAmountsOut",
                        args: [parsedAmount!, nextPath],
                    });

                    return { nextPath, input: parsedAmount!, output: amounts[amounts.length - 1] };
                }

                const wethAddress = args.intermediateToken?.address;
                const tokenInAddress = isNativeAddress(args.tokenIn.address) ? wethAddress : args.tokenIn.address;
                const tokenOutAddress = isNativeAddress(args.tokenOut.address) ? wethAddress : args.tokenOut.address;

                if (!tokenInAddress || !tokenOutAddress || tokenInAddress.toLowerCase() === tokenOutAddress.toLowerCase()) {
                    throw new Error("Unable to quote swap");
                }

                const directPath = [tokenInAddress, tokenOutAddress];
                const canUseIntermediate = Boolean(
                    args.intermediateToken &&
                        args.intermediateToken.address.toLowerCase() !== tokenInAddress.toLowerCase() &&
                        args.intermediateToken.address.toLowerCase() !== tokenOutAddress.toLowerCase(),
                );

                const allRoutes: RouteInfo[] = [];
                const directQuote = await quotePath(directPath).catch(() => undefined);
                if (directQuote) {
                    allRoutes.push({
                        path: directQuote.nextPath,
                        input: directQuote.input,
                        output: directQuote.output,
                        label: args.tokenIn && args.tokenOut ? `${args.tokenIn.symbol} → ${args.tokenOut.symbol}` : "Direct",
                    });
                }

                if (canUseIntermediate) {
                    const intermediateQuote = await quotePath([tokenInAddress, args.intermediateToken!.address, tokenOutAddress]).catch(() => undefined);
                    if (intermediateQuote) {
                        allRoutes.push({
                            path: intermediateQuote.nextPath,
                            input: intermediateQuote.input,
                            output: intermediateQuote.output,
                            label: `${args.tokenIn.symbol} → ${args.intermediateToken!.symbol} → ${args.tokenOut.symbol}`,
                        });
                    }
                }

                if (allRoutes.length === 0) throw new Error("Unable to quote swap");

                allRoutes.sort((a, b) => {
                    if (quoteMode === "exactOut") return a.input > b.input ? 1 : a.input < b.input ? -1 : 0;
                    return b.output > a.output ? 1 : b.output < a.output ? -1 : 0;
                });

                if (!cancelled) {
                    setRoutes(allRoutes);
                    setUpdatedAt(Date.now());
                }
            } catch (caught) {
                if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to quote swap");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        loadQuote();

        return () => {
            cancelled = true;
        };
    }, [parsedAmount, args.intermediateToken, args.routerAddress, args.tokenIn, args.tokenOut, publicClient, quoteMode, refreshNonce]);

    const selectedRoute = routes[selectedRouteIndex] ?? routes[0];
    const effectiveRouteIndex = selectedRoute ? selectedRouteIndex : 0;

    const amountIn = selectedRoute?.input ?? (quoteMode === "exactIn" ? parsedAmount : undefined);
    const amountOut = selectedRoute?.output ?? (quoteMode === "exactOut" ? parsedAmount : undefined);
    const path = selectedRoute?.path;

    const slippageBps = Number.isFinite(args.slippageBps) ? Math.min(9_900, Math.max(0, Math.round(args.slippageBps))) : 50;
    const amountOutMin = quoteMode === "exactIn" && amountOut !== undefined ? (amountOut * BigInt(10_000 - slippageBps)) / 10_000n : undefined;
    const amountInMax = quoteMode === "exactOut" && amountIn !== undefined ? (amountIn * BigInt(10_000 + slippageBps) + 9_999n) / 10_000n : undefined;
    const rate = amountOut && amountIn && args.tokenIn && args.tokenOut
        ? (Number(formatUnits(amountOut, args.tokenOut.decimals)) / Number(formatUnits(amountIn, args.tokenIn.decimals))).toLocaleString(undefined, {
              maximumFractionDigits: 8,
          })
        : undefined;

    const routeLabel = selectedRoute?.label ?? (args.tokenIn && args.tokenOut ? `${args.tokenIn.symbol} → ${args.tokenOut.symbol}` : undefined);

    return {
        amountIn,
        amountOut,
        amountOutMin,
        amountInMax,
        rate,
        path,
        routeLabel,
        routes,
        selectedRouteIndex: effectiveRouteIndex,
        setSelectedRouteIndex,
        refetch: () => setRefreshNonce((value) => value + 1),
        updatedAt,
        isLoading,
        error,
    };
}
