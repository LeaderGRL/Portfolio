/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js}"],
  theme: {
    extend: { 
      fontFamily: {
        'GalanoGrotesqueAlt-Bold': ['GalanoGrotesqueAlt-Bold'],
        'GalanoGrotesqueAlt-Medium': ['GalanoGrotesqueAlt-Medium']
      },
      letterSpacing: {
        'widest2' : '0.4em',
        'widest3' : '0.75em',
      },
      height: {
        '70' : '280px',
      },
    },
  },
  plugins: [],
}

