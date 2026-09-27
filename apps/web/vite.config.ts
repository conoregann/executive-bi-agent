import { defineConfig } from 'vite';
// Explicit, fixed upstream: browser input cannot select an arbitrary destination.
export default defineConfig({
  server: {
    proxy: { '/v1/investigations': { target: 'http://127.0.0.1:3001' } },
  },
});
