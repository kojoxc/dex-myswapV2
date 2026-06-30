import { useEffect, useState } from "react";
import { type Address, isAddress } from "viem";
import { useChainId } from "wagmi";

type DeploymentToken = {
    address: string;
    symbol?: string;
    name?: string;
    decimals?: number;
};

export type DeploymentConfig = {
    chainId: number;
    factory?: Address;
    router?: Address;
    weth?: Address;
    tokens: DeploymentToken[];
};

type DeploymentJson = {
    chainId?: number;
    factory?: string;
    router?: string;
    weth?: string;
    tokens?: DeploymentToken[];
};

function toAddress(value?: string) {
    return value && isAddress(value) ? (value as Address) : undefined;
}

export function useDeploymentConfig() {
    const chainId = useChainId();
    const [deployment, setDeployment] = useState<DeploymentConfig>();
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string>();

    useEffect(() => {
        let cancelled = false;

        async function loadDeployment() {
            setDeployment(undefined);
            setError(undefined);
            setIsLoading(true);

            try {
                const response = await fetch(`/deployments/${chainId}.json`, { cache: "no-store" });
                if (!response.ok) {
                    if (response.status === 404) return;
                    throw new Error(`Deployment file returned ${response.status}`);
                }

                const json = (await response.json()) as DeploymentJson;
                if (cancelled) return;

                setDeployment({
                    chainId: json.chainId ?? chainId,
                    factory: toAddress(json.factory),
                    router: toAddress(json.router),
                    weth: toAddress(json.weth),
                    tokens: json.tokens ?? [],
                });
            } catch (caught) {
                if (!cancelled) setError(caught instanceof Error ? caught.message : "Failed to load deployment config");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        loadDeployment();

        return () => {
            cancelled = true;
        };
    }, [chainId]);

    return { deployment, isLoading, error };
}
