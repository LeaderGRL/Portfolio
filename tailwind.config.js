/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js}"],
  theme: {
    extend: { 
      fontFamily: {
        'GalanoGrotesqueAlt-Bold': ['GalanoGrotesqueAlt-Bold'],
      },
      letterSpacing: {
        'widest2' : '0.4em',
        'widest3' : '0.75em',
      }
    },
  },
  plugins: [],
}

