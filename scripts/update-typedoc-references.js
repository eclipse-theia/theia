#!/usr/bin/env node

// *****************************************************************************
// Copyright (C) 2024 Eclipse Foundation and others.
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
 * TypeScript projects in the monorepo.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

/**
 * Use lerna to discover all workspace packages with TypeScript configs
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
      if (fs.existsSync(tsconfigPath)) {
        // Convert absolute path to relative path from root
        const relativePath = path.relative(rootDir, pkg.location).replace(/\\/g, '/');
        projects.push(relativePath);
      }
    }
    
    return projects.sort();
  } catch (error) {
    console.error('Failed to use lerna for package discovery:', error.message);
    console.log('Falling back to workspace-based discovery...');
    return null;
  }
}

/**
 * Fallback method: find all directories containing tsconfig.json files using workspaces
 * @param {string} dir - Directory to search in
 * @param {string[]} workspaceRoots - Array of workspace root patterns
 * @returns {string[]} Array of relative paths to directories with tsconfig.json
 */
function findTypeScriptProjectsWithWorkspaces(dir, workspaceRoots) {
  const projects = [];
  
  for (const workspaceRoot of workspaceRoots) {
    const workspacePath = path.join(dir, workspaceRoot);
    
    if (!fs.existsSync(workspacePath)) {
      console.log(`Skipping non-existent workspace: ${workspacePath}`);
      continue;
    }
    
    // Handle wildcard patterns like "packages/*"
    if (workspaceRoot.endsWith('/*')) {
      const baseDir = workspaceRoot.slice(0, -2);
      const basePath = path.join(dir, baseDir);
      
      if (fs.existsSync(basePath)) {
        const subdirs = fs.readdirSync(basePath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        
        for (const subdir of subdirs) {
          const subdirPath = path.join(basePath, subdir);
          const tsconfigPath = path.join(subdirPath, 'tsconfig.json');
          
          if (fs.existsSync(tsconfigPath)) {
            projects.push(path.join(baseDir, subdir).replace(/\\/g, '/'));
          }
        }
      }
    } else {
      // Handle exact paths
      const tsconfigPath = path.join(workspacePath, 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        projects.push(workspaceRoot.replace(/\\/g, '/'));
      }
    }
  }
  
  return projects.sort();
}

/**
 * Update the typedoc.tsconfig.json file with discovered TypeScript projects
 * @param {string} configPath - Path to the typedoc.tsconfig.json file
 * @param {string[]} projects - Array of project paths
 * @param {boolean} dryRun - If true, only show what would be changed
 */
function updateTypedocConfig(configPath, projects, dryRun = false) {
  let config;
  
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configContent);
  } catch (error) {
    console.error(`Error reading ${configPath}:`, error.message);
    process.exit(1);
  }
  
  // Convert project paths to reference objects
  const newReferences = projects.map(project => ({ path: project }));
  const currentReferences = config.references || [];
  
  // Compare current vs new references
  const currentPaths = currentReferences.map(ref => ref.path).sort();
  const newPaths = projects.sort();
  
  const needsUpdate = currentPaths.length !== newPaths.length || 
    currentPaths.some((path, index) => path !== newPaths[index]);
  
  if (!needsUpdate) {
    console.log(`✓ ${configPath} is already up to date (${newReferences.length} references)`);
    return false;
  }
  
  if (dryRun) {
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
    
    return true;
  }
  
  // Update the references
  config.references = newReferences;
  
  // Write back the updated config
  try {
    const updatedContent = JSON.stringify(config, null, 2) + '\n';
    fs.writeFileSync(configPath, updatedContent);
    console.log(`✓ Updated ${configPath} with ${newReferences.length} TypeScript project references`);
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
typedoc.tsconfig.json based on the workspace packages that have tsconfig.json files.
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
  
  if (!fs.existsSync(typedocConfigPath)) {
    console.error('Error: typedoc.tsconfig.json not found. Make sure you run this script from the monorepo root.');
    process.exit(1);
  }
  
  // Try to use lerna first, fallback to workspace discovery
  let projects = findTypeScriptProjectsWithLerna(rootDir);
  
  if (!projects) {
    // Fallback to workspace-based discovery
    let packageJson;
    try {
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
      packageJson = JSON.parse(packageJsonContent);
    } catch (error) {
      console.error('Error reading package.json:', error.message);
      process.exit(1);
    }
    
    // Get workspace configuration
    const workspaces = packageJson.workspaces;
    if (!workspaces || !Array.isArray(workspaces)) {
      console.error('Error: No workspaces configuration found in package.json and lerna discovery failed');
      process.exit(1);
    }
    
    if (verbose) {
      console.log('Found workspaces configuration:', workspaces);
    }
    
    projects = findTypeScriptProjectsWithWorkspaces(rootDir, workspaces);
  }
  
  if (verbose || dryRun) {
    console.log(`Found ${projects.length} TypeScript projects:`);
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
  findTypeScriptProjectsWithWorkspaces, 
  updateTypedocConfig 
};