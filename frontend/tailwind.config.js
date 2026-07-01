/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                page: "#070b14",
                card: "#0e1422",
                surface: "#151d2d",
                hover: "#1a2436",
                primary: "#f7f8fb",
                secondary: "#a8b0c2",
                muted: "#6f7a91",
                success: "#34d399",
                warning: "#fbbf24",
                danger: "#fb7185",
            },
            borderRadius: {
                sm: "10px",
                md: "16px",
                lg: "24px",
                xl: "28px",
            },
            boxShadow: {
                glow: "0 20px 80px rgba(122, 92, 255, 0.28)",
                card: "0 22px 70px rgba(0, 0, 0, 0.35)",
                surface: "0 10px 30px rgba(0, 0, 0, 0.25)",
                toast: "0 12px 40px rgba(0, 0, 0, 0.45)",
            },
            fontFamily: {
                sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
            },
        },
    },
    plugins: [],
};
