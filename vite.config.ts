import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({command})=>({
  base: command==='build' ? (process.env.VITE_BASE_PATH||'/oris-til-platform/') : '/',
  plugins:[react(),tailwindcss()],
  server:{proxy:{'/api':{target:'http://127.0.0.1:8787',changeOrigin:false}}}
}));

