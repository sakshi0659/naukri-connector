import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const manifest=JSON.parse(readFileSync('dist/manifest.json','utf8'));
const required=[manifest.background.service_worker,manifest.side_panel.default_path,...manifest.content_scripts.flatMap(script=>script.js)];
for(const file of required)assert.ok(existsSync(`dist/${file}`),`Missing manifest artifact: ${file}`);
const content=readFileSync('dist/content.js','utf8');
assert.doesNotMatch(content,/^\s*import\s/m,'Chrome content.js must be a standalone classic script');
assert.match(content,/chrome\.runtime\.onMessage/,'Content script message listener is missing');
console.log('Production bundle verified: all manifest files exist and content.js is standalone.');
