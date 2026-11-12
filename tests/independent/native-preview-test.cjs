const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.cwd(), s=fs.readFileSync(path.join(root,'capacitor.config.ts'),'utf8');
assert.match(s,/ELEEVEON_NATIVE_PREVIEW/);assert.match(s,/independent-native-dist/);assert.match(s,/webDir:.*out/);
const html=fs.readFileSync(path.join(root,'independent-native-preview','index.html'),'utf8');
assert.match(html,/connect-src 'none'/);assert.doesNotMatch(html,/<script[^>]*src=["']https?:/i);console.log('PASS: native-preview configuration and offline-asset contract.');
