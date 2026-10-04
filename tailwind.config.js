/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        saffron: {
          DEFAULT: '#F4A62C',
          50: '#FEF6E8',
          100: '#FCEAC7',
          200: '#F9D693',
          300: '#F7C25F',
          400: '#F4B345',
          500: '#F4A62C',
          600: '#D98A16',
          700: '#B06D10',
          800: '#7E4E0C',
          900: '#4D3007',
        },
        vermilion: {
          DEFAULT: '#D30000',
          50: '#FCE8E8',
          100: '#F7C2C2',
          400: '#E33333',
          500: '#D30000',
          600: '#B00000',
          700: '#8A0000',
          800: '#5C0000',
        },
        cream: {
          DEFAULT: '#FDF5E7',
          100: '#FFFFFF',
          200: '#FDF5E7',
          300: '#F8ECD4',
          400: '#F0DEB8',
        },
        ink: '#2B1A0E',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      backgroundImage: {
        'radial-medallion': 'radial-gradient(circle at center, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
};
