// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

const fs = require('fs');
const path = require('path');

const resourcesDir = path.join(__dirname, '../resources/llm-providers');
const outFile = path.join(__dirname, '../src/common/qaap-llm-provider-icon-assets.ts');

const checkOnly = process.argv.includes('--check');

function buildIconAssetsSource() {
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
    return {
        source: `// Auto-generated from resources/llm-providers/*.png — re-run: npm run sync:llm-provider-icons --prefix packages/qaap-mobile-shell

export const LLM_PROVIDER_ICON_DATA_URLS: Readonly<Record<string, string>> = {
${lines.join('\n')}
};
`,
        iconCount: Object.keys(urls).length,
    };
}

const { source, iconCount } = buildIconAssetsSource();

if (checkOnly) {
    const existing = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
    if (existing !== source) {
        console.error(`Icon assets out of sync: ${path.relative(process.cwd(), outFile)}`);
        console.error('Run: npm run sync:llm-provider-icons --prefix packages/qaap-mobile-shell');
        process.exit(1);
    }
    console.log(`Icon assets in sync (${iconCount} icons)`);
    process.exit(0);
}

fs.writeFileSync(outFile, source);
console.log(`Wrote ${iconCount} icons to ${path.relative(process.cwd(), outFile)}`);
