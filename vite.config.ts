import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify('1.4.3'),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  }
})
