import { useEffect, useMemo, useState } from "react";
import { type Address, formatUnits, isAddress, parseUnits } from "viem";
import { usePublicClient } from "wagmi";

import { routerAbi } from "../abis";
import type { TokenInfo } from "../types";

type UseSwapQuoteResult = {
    amountIn?: bigint;
    amountOut?: bigint;
    amountOutMin?: bigint;
    rate?: string;
    path?: Address[];
    routeLabel?: string;
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
}): UseSwapQuoteResult {
    const publicClient = usePublicClient();
    const [amountOut, setAmountOut] = useState<bigint>();
    const [path, setPath] = useState<Address[]>();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string>();

    const amountIn = useMemo(() => {
        if (!args.tokenIn || !args.amount || Number(args.amount) <= 0) return undefined;
        try {
            return parseUnits(args.amount, args.tokenIn.decimals);
        } catch {
            return undefined;
        }
    }, [args.amount, args.tokenIn]);

    useEffect(() => {
        let cancelled = false;

        async function loadQuote() {
            setAmountOut(undefined);
            setPath(undefined);
            setError(undefined);

            if (!publicClient || !isAddress(args.routerAddress) || !args.tokenIn || !args.tokenOut || !amountIn || amountIn <= 0n) {
                setIsLoading(false);
                return;
            }

            setIsLoading(true);

            try {
                async function quotePath(nextPath: Address[]) {
                    const amounts = await publicClient!.readContract({
                        address: args.routerAddress as Address,
                        abi: routerAbi,
                        functionName: "getAmountsOut",
                        args: [amountIn!, nextPath],
                    });

                    return { nextPath, output: amounts[amounts.length - 1] };
                }

                const directPath = [args.tokenIn.address, args.tokenOut.address];
                const canUseIntermediate = Boolean(
                    args.intermediateToken &&
                        args.intermediateToken.address.toLowerCase() !== args.tokenIn.address.toLowerCase() &&
                        args.intermediateToken.address.toLowerCase() !== args.tokenOut.address.toLowerCase(),
                );

                const directQuote = await quotePath(directPath).catch(() => undefined);
                const intermediateQuote = canUseIntermediate
                    ? await quotePath([args.tokenIn.address, args.intermediateToken!.address, args.tokenOut.address]).catch(() => undefined)
                    : undefined;

                const bestQuote = !directQuote
                    ? intermediateQuote
                    : intermediateQuote && intermediateQuote.output > directQuote.output
                      ? intermediateQuote
                      : directQuote;

                if (!bestQuote) throw new Error("Unable to quote swap");

                if (!cancelled) {
                    setAmountOut(bestQuote.output);
                    setPath(bestQuote.nextPath);
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
    }, [amountIn, args.intermediateToken, args.routerAddress, args.tokenIn, args.tokenOut, publicClient]);

    const slippageBps = Number.isFinite(args.slippageBps) ? Math.min(9_900, Math.max(0, Math.round(args.slippageBps))) : 50;
    const amountOutMin = amountOut === undefined ? undefined : (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
    const rate = amountOut && amountIn && args.tokenIn && args.tokenOut
        ? (Number(formatUnits(amountOut, args.tokenOut.decimals)) / Number(formatUnits(amountIn, args.tokenIn.decimals))).toLocaleString(undefined, {
              maximumFractionDigits: 8,
          })
        : undefined;

    const routeLabel = path && args.tokenIn && args.tokenOut
        ? path.length > 2 && args.intermediateToken
            ? `${args.tokenIn.symbol} → ${args.intermediateToken.symbol} → ${args.tokenOut.symbol}`
            : `${args.tokenIn.symbol} → ${args.tokenOut.symbol}`
        : undefined;

    return { amountIn, amountOut, amountOutMin, rate, path, routeLabel, isLoading, error };
}
