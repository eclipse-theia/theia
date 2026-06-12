// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

const fs = require('fs');
const path = require('path');

const resourcesDir = path.join(__dirname, '../resources/llm-providers');
const outFile = path.join(__dirname, '../src/common/qaap-llm-provider-icon-assets.ts');

const urls = {};
for (const fileName of fs.readdirSync(resourcesDir).sort()) {
    if (!fileName.endsWith('.png')) {
        continue;
    }
    const key = fileName.slice(0, -4);
    const data = fs.readFileSync(path.join(resourcesDir, fileName)).toString('base64');
    urls[key] = `data:image/png;base64,${data}`;
}

const lines = Object.entries(urls).map(([key, value]) => `    '${key}': '${value}',`);
const contents = `// Auto-generated from resources/llm-providers/*.png — re-run: node packages/qaap-mobile-shell/scripts/qaap-llm-provider-icons-sync.js

export const LLM_PROVIDER_ICON_DATA_URLS: Readonly<Record<string, string>> = {
${lines.join('\n')}
};
`;

fs.writeFileSync(outFile, contents);
console.log(`Wrote ${Object.keys(urls).length} icons to ${path.relative(process.cwd(), outFile)}`);
