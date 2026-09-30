import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import {fileURLToPath} from 'url';import {resolve} from 'path';
const here=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({plugins:[react()],build:{outDir:'dist',emptyOutDir:true,rollupOptions:{input:{popup:resolve(here,'src/popup/index.html'),background:resolve(here,'src/background/serviceWorker.ts')},output:{entryFileNames:'[name].js',chunkFileNames:'assets/[name]-[hash].js'}}}})
