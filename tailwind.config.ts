/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'pp-panel': 'rgb(var(--pp-panel) / <alpha-value>)',
        'pp-accent-primary': 'rgb(var(--pp-accent-primary) / <alpha-value>)',
        'pp-accent-secondary': 'rgb(var(--pp-accent-secondary) / <alpha-value>)',
        'pp-accent-tertiary': 'rgb(var(--pp-accent-tertiary) / <alpha-value>)',

        // the two co-op bots: Atlas (blue) and P-body (orange)
        'pp-role-blue': 'rgb(var(--pp-role-blue) / <alpha-value>)',
        'pp-role-orange': 'rgb(var(--pp-role-orange) / <alpha-value>)',

        'pp-health-low': 'rgb(var(--pp-health-low) / <alpha-value>)',
      },

      keyframes: {},

      animation: {},
    },
  },
  plugins: [],
}
