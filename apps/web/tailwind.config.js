/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#090B10',
        surface: {
          DEFAULT: '#10141D',
          raised: '#171D28',
          hover: '#202938'
        },
        border: {
          DEFAULT: '#252D3A',
          strong: '#344052'
        },
        text: {
          primary: '#F1F4F8',
          secondary: '#9AA6B7',
          muted: '#697588'
        },
        accent: {
          DEFAULT: '#A78BFA',
          hover: '#B9A4FF'
        },
        success: '#36C98F',
        warning: '#F2B95D',
        danger: '#F06B78',
        info: '#65B9ED'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'monospace']
      }
    },
  },
  plugins: [],
}
