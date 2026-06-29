/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            boxShadow: {
                glow: "0 20px 80px rgba(122, 92, 255, 0.28)",
            },
        },
    },
    plugins: [],
};
