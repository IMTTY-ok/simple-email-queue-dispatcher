/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Navy — header and structure
        navy: {
          900: '#172A43',
          800: '#1D3453',
          700: '#24436A',
          500: '#33587F',
          100: '#E7EDF5',
        },
        // Page + card surfaces
        surface: {
          DEFAULT: '#F4F6F9',
          card: '#FFFFFF',
          head: '#FBFCFE',
        },
        // Hairlines
        hairline: {
          DEFAULT: '#CCD6E3',
          soft: '#E4EAF2',
        },
        // Operational colours
        action: {
          green: '#16815B',
          greenSoft: '#E7F4EE',
          amber: '#A56B18',
          amberSoft: '#FDF3E3',
          red: '#B24545',
          redSoft: '#FBECEC',
          slate: '#465F7B',
          slateSoft: '#EEF2F7',
        },
        ink: {
          DEFAULT: '#1B2B41',
          muted: '#5A6E87',
          faint: '#8698AC',
        },
      },
      borderRadius: {
        card: '10px',
        control: '6px',
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '1.4' }],
        '3xs': ['9.5px', { lineHeight: '1.4' }],
      },
    },
  },
  plugins: [],
}
