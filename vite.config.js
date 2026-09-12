import { defineConfig } from 'vite'
import content from './plugins/content.js'

export default defineConfig({
  plugins: [
    content('content'),
  ],
  build: {
    // Keep only tiny assets inline. Larger sprites, fonts and chassis images
    // become fingerprinted files so browsers can cache them independently.
    assetsInlineLimit: 4096,
    reportCompressedSize: false,
    target: 'es2022',
  },
})
