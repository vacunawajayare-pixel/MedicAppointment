/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // RHU portal brand — taken from the LoginShell mockup, now system-wide.
        brand: {
          DEFAULT: '#0e4a3a', // pine primary
          dark: '#0a3a23', // deep button / hover
          border: '#0f3d2e', // input borders
          deep: '#0b4e4b', // secondary dark teal
          teal: '#4ea895', // accent
          mint: '#cfe4d0', // light panel
          mintlight: '#dcecdb',
          mintdark: '#aecfb2',
          pill: '#cde6cf',
          cream: '#fdfbe7', // light form surface
          canvas: '#dde7da', // light page backdrop
          ink: '#122e1e', // light headings
          pine: '#123524',
        },
        pinedark: {
          canvas: '#070c0a',
          panel: '#101815',
          input: '#16281f',
          grad1: '#14382a',
          grad2: '#0f2c22',
          grad3: '#081712',
        },
      },
    },
  },
  plugins: [],
};
