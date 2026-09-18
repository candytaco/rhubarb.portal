import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths(), nodePolyfills({ include: ['events'] })],
  worker: {
    format: 'es',
    // the parse worker shares the tsconfig path aliases (e.g. @constants/*) with the main bundle
    plugins: () => [tsconfigPaths()],
  },
})
