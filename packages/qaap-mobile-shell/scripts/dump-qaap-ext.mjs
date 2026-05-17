import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const files = [
    'packages/qaap-extensions/src/browser/qaap-mobile-layout-utils.ts',
    'packages/qaap-extensions/src/browser/qaap-extensions-frontend-module.ts',
    'packages/qaap-extensions/src/browser/qaap-outline-mobile-contribution.ts',
    'packages/qaap-extensions/src/browser/qaap-file-navigator-contribution.ts',
    'packages/qaap-extensions/src/browser/qaap-navigator-widget-factory.ts',
    'packages/qaap-extensions/package.json',
    'packages/vsx-registry/src/browser/vsx-extensions-widget.tsx',
    'packages/vsx-registry/src/browser/vsx-registry-frontend-module.ts',
];
let out = '';
for (const rel of files) {
    const abs = path.join(root, rel);
    out += `\n===== ${rel} =====\n`;
    try {
        out += fs.readFileSync(abs, 'utf8');
    } catch (e) {
        out += `ERR: ${e.message}\n`;
    }
}
const dest = path.join(root, 'packages/qaap-mobile-shell/src/browser/_qaap-ext-dump.txt');
fs.writeFileSync(dest, out);
console.log('wrote', dest, out.length);
