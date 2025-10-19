#!/usr/bin/env node
/**
 * Generate TypeDoc docs for each non-private package in this monorepo.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const rootDir = process.cwd();

/**
 * Collects all non-private packages from rootDir/packages and no other source.
 * 
 * This function:
 * 1. Queries lerna for all packages in the monorepo
 * 2. Filters to only include packages located in rootDir/packages
 * 3. Further filters to exclude:
 *    - Private packages (where package.json has "private": true)
 *    - Packages without a tsconfig.json file
 */
function getPackages() {
    const lernaOutput = cp.execSync('npx lerna ls --loglevel=silent --all --json', {
        cwd: rootDir,
        encoding: 'utf8'
    });
    const packages = JSON.parse(lernaOutput);
    const packagesDir = path.join(rootDir, 'packages');
    return packages.filter(pkg => {
        // Only include packages from rootDir/packages (excludes examples, dev-packages, etc.)
        const isInPackagesDir = pkg.location.startsWith(packagesDir);
        if (!isInPackagesDir) {
            return false;
        }
        const pkgJson = JSON.parse(fs.readFileSync(path.join(pkg.location, 'package.json'), 'utf8'));
        const tsconfigPath = path.join(pkg.location, 'tsconfig.json');
        return fs.existsSync(tsconfigPath) && pkgJson.private !== true;
    });
}

function runTypedoc(pkg) {
    const outRoot = path.join(rootDir, 'gh-pages/packages');
    const pkgName = path.basename(pkg.location);
    const configFile = path.join(rootDir, 'configs/package.typedoc.json');
    const outFile = path.join(outRoot, pkgName + '.json');
    const tsconfigPath = path.join(pkg.location, 'tsconfig.json');
    const readmePath = path.join(pkg.location, 'README.md');

    if (!fs.existsSync(tsconfigPath)) {
        console.warn(`⚠️  Skipping ${pkgName}: no tsconfig.json`);
        return;
    }

    const args = [
        'npx typedoc',
        '--options', configFile,
        '--json', outFile,
        '--tsconfig', tsconfigPath,
        '--readme', readmePath,
        './src'
    ];

    const start = Date.now();
    try {
        cp.execSync(args.join(' '), { cwd: pkg.location, stdio: 'inherit' });
        const duration = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`${pkgName} done in ${duration}s → ${path.relative(rootDir, outFile)}`);
    } catch (err) {
        console.error(`❌ Failed for ${pkgName}:`, err.message);
    }
}

function main() {
    const start = Date.now();
    const packages = getPackages();
    console.log(`\nFound ${packages.length} TypeScript packages.`);

    for (const pkg of packages) {
        runTypedoc(pkg);
    }
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n✅ TypeDoc generation per package complete in ${duration}s`);
}

main();
