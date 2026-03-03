#!/usr/bin/env node
/**
 * Merge all package specific TypeDoc docs json files into a unified HTML site.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const rootDir = process.cwd();

function getTheiaVersion() {
    const lernaJsonPath = path.join(rootDir, 'lerna.json');
    const lernaJson = JSON.parse(fs.readFileSync(lernaJsonPath, 'utf8'));
    return lernaJson.version;
}

function main() {
    const start = Date.now();
    console.log('\nMerging all package docs into a unified site...');
    const args = [
        'npx typedoc',
        '--options', './configs/merge.typedoc.json',
        '--name', `"Theia API Documentation v${getTheiaVersion()}"`
    ];

    cp.execSync(args.join(' '), { cwd: rootDir, stdio: 'inherit' });
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n✅ Documentation generation complete in ${duration}s`);

    // Cleanup: Remove the gh-pages/packages directory after merge as we do not want to publish those files
    const packagesDir = path.join(rootDir, 'gh-pages', 'packages');
    if (fs.existsSync(packagesDir)) {
        console.log('\nCleaning up gh-pages/packages...');
        fs.rmSync(packagesDir, { recursive: true, force: true });
        console.log('✅ Cleanup complete');
    }
}

main();
