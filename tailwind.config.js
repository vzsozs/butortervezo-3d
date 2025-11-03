/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // === ÚJ: SAJÁT DESIGN TOKENEK ===
      colors: {
        'panel-bg': '#2d2d2d',       // A panelek háttérszíne (kicsit világosabb, mint a tied)
        'panel-border': '#4a4a4a',   // A panelek keretszíne
        'text-primary': '#e0e0e0',    // Elsődleges szövegszín
        'text-secondary': '#a0a0a0', // Másodlagos, halványabb szövegszín (címkékhez)
        'accent-yellow': '#ffc800',  // Kiemelő sárga (fókuszhoz)
        'accent-red': '#e53e3e',     // Figyelmeztető piros (törlés gomb)
      },
      fontSize: {
        'xxs': '0.65rem', // Extra kicsi betűméret
      },
    },
  },
  plugins: [],
}