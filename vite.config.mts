import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  // the site is published as a GitHub Pages project page, so it is served from /<repo>/
  base: '/rhubarb.portal/',
  plugins: [react(), tsconfigPaths(), nodePolyfills({ include: ['events'] })],
  server: {
    allowedHosts: ['fish-shaped-ethylbenzene.tianjiao-zhang.com'],
  },
  worker: {
    format: 'es',
    // the parse worker shares the tsconfig path aliases (e.g. @constants/*) with the main bundle
    plugins: () => [tsconfigPaths()],
  },
})
