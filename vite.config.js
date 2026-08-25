import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import content from './plugins/content.js'

export default defineConfig({
  plugins: [
    content('content'),
    // The deliverable is one file that can be dropped on any host with no
    // build step and no asset paths to get wrong. Everything — sprites,
    // shaders, content — ends up inside dist/index.html.
    viteSingleFile({ removeViteModuleLoader: true }),
  ],
  build: {
    assetsInlineLimit: 100_000_000,   // inline every sprite, whatever its size
    cssCodeSplit: false,
    reportCompressedSize: false,
    target: 'es2022',
  },
})
