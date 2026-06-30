export function sanitizeAmountInput(value: string, maxDecimals?: number) {
    const decimalLimit = typeof maxDecimals === "number" && Number.isFinite(maxDecimals)
        ? Math.max(0, Math.floor(maxDecimals))
        : undefined;
    let nextValue = "";
    let hasDecimalPoint = false;
    let decimalDigits = 0;

    for (const char of value) {
        if (char >= "0" && char <= "9") {
            if (hasDecimalPoint && decimalLimit !== undefined && decimalDigits >= decimalLimit) continue;
            nextValue += char;
            if (hasDecimalPoint) decimalDigits += 1;
            continue;
        }

        if (char === "." && !hasDecimalPoint) {
            hasDecimalPoint = true;
            if (decimalLimit !== 0) nextValue += char;
        }
    }

    return nextValue;
}
