// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * This script automatically updates the TypeScript project references in
 * typedoc.tsconfig.json based on the workspace configuration and available
 * non-private TypeScript projects in the monorepo.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

/**
 * Use lerna to discover all non-private workspace packages with TypeScript configs
 * @param {string} rootDir - Root directory of the monorepo
 * @returns {string[]} Array of relative paths to directories with tsconfig.json
 */
function findTypeScriptProjectsWithLerna(rootDir) {
  try {
    // Get all lerna packages
    const lernaOutput = cp.execSync('npx lerna ls --loglevel=silent --all --json', {
      cwd: rootDir,
      encoding: 'utf8'
    });

    const packages = JSON.parse(lernaOutput);
    const projects = [];

    for (const pkg of packages) {
      const tsconfigPath = path.join(pkg.location, 'tsconfig.json');
      const packageJsonPath = path.join(pkg.location, 'package.json');

      if (fs.existsSync(tsconfigPath) && fs.existsSync(packageJsonPath)) {
        // Read package.json to check if package is private
        try {
          const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
          const packageJson = JSON.parse(packageJsonContent);

          // Only include packages that are not private
          if (packageJson.private !== true) {
            // Convert absolute path to relative path from root
            const relativePath = path.relative(rootDir, pkg.location).replace(/\\/g, '/');
            projects.push(relativePath);
          }
        } catch (error) {
          console.warn(`Warning: Could not read package.json for ${pkg.name}:`, error.message);
        }
      }
    }

    return projects.sort();
  } catch (error) {
    console.error('Failed to use lerna for package discovery:', error.message);
    throw new Error('Lerna is required for package discovery but is not available or failed to run');
  }
}

/**
 * Update the typedoc.tsconfig.json file with discovered TypeScript projects
 * @param {string} configPath - Path to the typedoc.tsconfig.json file
 * @param {string[]} projects - Array of project paths
 * @param {boolean} dryRun - If true, only show what would be changed
 */
function updateTypedocConfig(configPath, projects, dryRun = false) {
  let config;
  let configExists = false;

  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configContent);
    configExists = true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, create default configuration
      console.log(`Creating new TypeDoc configuration at ${configPath}`);
      config = {
        "extends": "./configs/base.tsconfig.json",
        "include": [],
        "compilerOptions": {
          "composite": true,
          "allowJs": true
        },
        "references": []
      };
      configExists = false;
    } else {
      console.error(`Error reading ${configPath}:`, error.message);
      process.exit(1);
    }
  }

  // Convert project paths to reference objects
  const newReferences = projects.map(project => ({ path: project }));
  const currentReferences = config.references || [];

  // Compare current vs new references
  const currentPaths = currentReferences.map(ref => ref.path).sort();
  const newPaths = projects.sort();

  const needsUpdate = currentPaths.length !== newPaths.length ||
    currentPaths.some((path, index) => path !== newPaths[index]);

  if (!needsUpdate && configExists) {
    console.log(`✓ ${configPath} is already up to date (${newReferences.length} references)`);
    return false;
  }

  if (dryRun) {
    if (!configExists) {
      console.log(`Would create ${configPath} with ${newReferences.length} TypeScript project references:`);
      newPaths.forEach(path => console.log(`    + ${path}`));
    } else {
      console.log(`Would update ${configPath} with ${newReferences.length} TypeScript project references:`);
      const added = newPaths.filter(path => !currentPaths.includes(path));
      const removed = currentPaths.filter(path => !newPaths.includes(path));

      if (added.length > 0) {
        console.log('  Added references:');
        added.forEach(path => console.log(`    + ${path}`));
      }

      if (removed.length > 0) {
        console.log('  Removed references:');
        removed.forEach(path => console.log(`    - ${path}`));
      }
    }

    return true;
  }

  // Update the references
  config.references = newReferences;

  // Write back the updated config
  try {
    const updatedContent = JSON.stringify(config, null, 2) + '\n';
    fs.writeFileSync(configPath, updatedContent);
    if (configExists) {
      console.log(`✓ Updated ${configPath} with ${newReferences.length} TypeScript project references`);
    } else {
      console.log(`✓ Created ${configPath} with ${newReferences.length} TypeScript project references`);
    }
    return true;
  } catch (error) {
    console.error(`Error writing ${configPath}:`, error.message);
    process.exit(1);
  }
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  const verbose = args.includes('--verbose') || args.includes('-v');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node update-typedoc-references.js [options]

Options:
  --dry-run, -n    Show what would be changed without making changes
  --verbose, -v    Show detailed output
  --help, -h       Show this help message

This script automatically updates the TypeScript project references in
typedoc.tsconfig.json based on non-private workspace packages that have tsconfig.json files.
`);
    process.exit(0);
  }

  const rootDir = process.cwd();
  const packageJsonPath = path.join(rootDir, 'package.json');
  const typedocConfigPath = path.join(rootDir, 'typedoc.tsconfig.json');

  // Check if we're in a valid monorepo
  if (!fs.existsSync(packageJsonPath)) {
    console.error('Error: package.json not found. Make sure you run this script from the monorepo root.');
    process.exit(1);
  }

  // Use lerna to discover non-private TypeScript projects
  let projects;
  try {
    projects = findTypeScriptProjectsWithLerna(rootDir);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Please ensure lerna is available and properly configured in your monorepo.');
    process.exit(1);
  }

  if (verbose || dryRun) {
    console.log(`Found ${projects.length} non-private TypeScript projects:`);
    projects.forEach(project => console.log(`  - ${project}`));
  }

  // Update the typedoc configuration
  const wasUpdated = updateTypedocConfig(typedocConfigPath, projects, dryRun);

  if (!dryRun && wasUpdated) {
    console.log('\n✓ TypeDoc configuration updated successfully!');
    console.log('You can now run: npm run docs');
  } else if (dryRun) {
    console.log('\nRun without --dry-run to apply these changes.');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  findTypeScriptProjectsWithLerna,
  updateTypedocConfig
};
