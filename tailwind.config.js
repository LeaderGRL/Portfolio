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
        '18' : '72px',
        '74' : '296px',
        '70' : '280px',
        '68' : '272px',
        '58' : '232px',
      },
      padding: {
        '18' : '72px',
      },
    },
  },
  plugins: [],
}

