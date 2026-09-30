import {defineConfig} from 'vite';
import {fileURLToPath} from 'url';
import {resolve} from 'path';

const here=fileURLToPath(new URL('.',import.meta.url));

export default defineConfig({
  build:{
    outDir:'dist',
    emptyOutDir:false,
    lib:{entry:resolve(here,'src/content/index.ts'),name:'NaukriAIContent',formats:['iife'],fileName:()=> 'content.js'},
    rollupOptions:{output:{inlineDynamicImports:true}},
  },
});
