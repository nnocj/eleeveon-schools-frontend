const fs = require('node:fs');
const file = 'package.json';
const p = JSON.parse(fs.readFileSync(file, 'utf8'));
p.scripts = { ...p.scripts,
  'mobile:prepare': 'node scripts/mobile-prepare.cjs',
  'mobile:add:android': 'npm run mobile:prepare && npx cap add android',
  'mobile:add:ios': 'npm run mobile:prepare && npx cap add ios',
  'mobile:sync': 'npm run mobile:prepare && npx cap sync',
  'mobile:open:android': 'npx cap open android',
  'mobile:open:ios': 'npx cap open ios'
};
p.dependencies = { ...p.dependencies, '@capacitor/ios': p.dependencies?.['@capacitor/ios'] || '^8.6.1' };
fs.writeFileSync(file, JSON.stringify(p,null,2)+'\n');
console.log('Added Capacitor scripts and iOS dependency; existing scripts preserved. Run npm install.');
