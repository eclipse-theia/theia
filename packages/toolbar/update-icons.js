// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

const fs = require('fs');
const path = require('path');

// ============
// FONT AWESOME
// ============

// This part generates an JSON array of font-awesome classnames from the font-awesome.css files
const fontAwesomeCSSPath = path.resolve(__dirname, '../../node_modules/font-awesome/css/font-awesome.css');
const fontAwesomeDestination = path.resolve(__dirname, './src/browser/icons/font-awesome.json');

// Read the CSS
const css = fs.readFileSync(fontAwesomeCSSPath, 'utf-8');

// Regex to match blocks like:
// .fa-remove:before, .fa-close:before, .fa-times:before { content: "\f00d"; }
const ruleRegex = /((?:\.fa-[\w-]+:before\s*,\s*)*\.fa-[\w-]+:before)\s*\{[^}]*?\bcontent\s*:\s*(['"])(\\f[0-9a-fA-F]{3,4}|\\[0-9a-fA-F]{1,6})\2[^}]*?\}/gm;

const mapping = Object.create(null);

let match;
while ((match = ruleRegex.exec(css)) !== null) {
    const selectors = match[1];
    const iconContent = match[3].replace(/^\\/, ''); // e.g. "f00d"

    // Each selector may be comma-separated
    selectors.split(',')
        .map(s => s.trim())
        .forEach(sel => {
            const name = sel.replace(/^\./, '').replace(/:before$/i, '');
            mapping[name] = iconContent;
        });
}

// Write result
fs.mkdirSync(path.dirname(fontAwesomeDestination), { recursive: true });
fs.writeFileSync(fontAwesomeDestination, JSON.stringify(mapping, null, 2), 'utf-8');

// Update the font-awesome-icons.ts file with the new mapping
const fontAwesomeTsPath = path.resolve(__dirname, './src/browser/icons/font-awesome-icons.ts');
const faTsFileContent = fs.readFileSync(fontAwesomeTsPath, 'utf-8');

// Convert mapping to TypeScript format
const faMappingEntries = Object.entries(mapping)
    .map(([key, value]) => `    '${key}': '${value}'`)
    .join(',\n');

const newFaMappingValue = `{\n${faMappingEntries}\n}`;

// Replace only the value of fontAwesomeMapping using regex
const updatedFaTsContent = faTsFileContent.replace(
    /export const fontAwesomeMapping = \{[\s\S]*?\};/,
    `export const fontAwesomeMapping = ${newFaMappingValue};`
);

fs.writeFileSync(fontAwesomeTsPath, updatedFaTsContent, 'utf-8');

// ========
// CODICONS
// ========

// This part generates a JSON array of codicons mappings from their classnames and their content from the mapping.json file
const codiconCSSPath = path.resolve(__dirname, '../../node_modules/@vscode/codicons/src/template/mapping.json')
const codiconDestination = path.resolve(__dirname, './src/browser/icons/codicon.json')
// Read the codicons mapping file, add 'codicon-' prefix to all keys, and write it to the destination
const codiconMapping = JSON.parse(fs.readFileSync(codiconCSSPath, 'utf-8'));
const prefixedCodiconMapping = {};

// Add 'codicon-' prefix to all keys
for (const key in codiconMapping) {
    prefixedCodiconMapping['codicon-' + key] = codiconMapping[key];
}

// Write the modified mapping to the destination
fs.writeFileSync(codiconDestination, JSON.stringify(prefixedCodiconMapping, null, 2));

// Update the codicons.ts file with the new mapping
const codiconTsPath = path.resolve(__dirname, './src/browser/icons/codicons.ts');
const tsFileContent = fs.readFileSync(codiconTsPath, 'utf-8');

// Convert mapping to TypeScript format
const mappingEntries = Object.entries(prefixedCodiconMapping)
    .map(([key, value]) => `    '${key}': ${value}`)
    .join(',\n');

const newMappingValue = `{\n${mappingEntries}\n}`;

// Replace only the value of codiconsMapping using regex
const updatedTsContent = tsFileContent.replace(
    /export const codiconsMapping = \{[\s\S]*?\};/,
    `export const codiconsMapping = ${newMappingValue};`
);

fs.writeFileSync(codiconTsPath, updatedTsContent, 'utf-8');
