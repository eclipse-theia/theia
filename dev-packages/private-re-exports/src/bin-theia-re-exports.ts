// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import fs = require('fs');
import mustache = require('mustache');
import os = require('os');
import path = require('path');
import semver = require('semver');
import yargs = require('yargs');
import ts = require('typescript');
import { parseModule } from './utility';
import { ReExport, PackageReExports } from './package-re-exports';
type EOL = '\r\n' | '\n' | '\r';

yargs
    .command(
        'generate [packageName]',
        'Generate Theia re-exports',
        cli => cli
            .positional('packageName', {
                type: 'string',
                describe: 'Name of the package to generate the re-exports for'
            }),
        async ({ packageName }) => {
            if (!packageName) {
                packageName = JSON.parse(await readFile(path.resolve('package.json'))).name as string;
            }
            const packageReExports = await PackageReExports.FromPackage(packageName);
            const writer = new FileWriter(findEol(await readFile(packageReExports.resolvePath('package.json'))));
            // Modules declared with `export =` cannot be re-exported from an ES module without losing their types,
            // so they are always re-exported from a CommonJS module, which also loads the CommonJS entry point of dual packages.
            const commonJsReExports = packageReExports.all.filter(reExport => reExport.reExportStyle === '='
                || isCommonJsModule(reExport.internalImport, packageReExports.packageRoot));
            const exportNames = collectExportNames(commonJsReExports.map(reExport => reExport.internalImport), packageReExports.packageRoot);
            await Promise.all(packageReExports.all.map(async reExport => {
                const reExportPath = packageReExports.resolvePath(reExport.reExportDir, reExport.moduleName, 'index');
                if (commonJsReExports.includes(reExport)) {
                    // A CommonJS module is re-exported from a CommonJS module, which behaves exactly like the original module.
                    // Node detects the named exports of a CommonJS module imported from an ES module by static analysis,
                    // which fails for modules that create their exports dynamically, so they are listed explicitly.
                    const names = exportNames.get(reExport.internalImport) ?? [];
                    let content = `module.exports = require('${reExport.internalImport}');\n`;
                    if (names.length) {
                        content += '// Lets Node detect the named exports when this module is imported from an ES module.\n'
                            + `0 && (module.exports = { ${names.join(', ')} });\n`;
                    }
                    await writer.write(`${reExportPath}.cjs`, content);
                    const declaration = reExport.reExportStyle === '='
                        ? `import ${reExport.exportNamespace} = require('${reExport.internalImport}');\nexport = ${reExport.exportNamespace};\n`
                        : `export * from '${reExport.internalImport}';\n`;
                    await writer.write(`${reExportPath}.d.cts`, declaration);
                    await writer.remove(`${reExportPath}.js`, `${reExportPath}.d.ts`);
                } else if (reExport.reExportStyle === '*') {
                    const content = `export * from '${reExport.internalImport}';\n`;
                    await writer.write(`${reExportPath}.js`, content);
                    await writer.write(`${reExportPath}.d.ts`, content);
                    await writer.remove(`${reExportPath}.cjs`, `${reExportPath}.d.cts`);
                } else {
                    console.warn('unexpected re-export');
                }
            }));
        }
    )
    .command(
        'template inputFile [packageName]',
        'Evaluate mustache templates',
        cli => cli
            .positional('inputFile', {
                type: 'string',
                describe: 'File to evaluate defined using mustache template syntax',
                demandOption: true
            })
            .positional('packageName', {
                type: 'string',
                describe: 'Name of the package to generate the re-exports for'
            }),
        async ({ inputFile, packageName }) => {
            if (!packageName) {
                packageName = JSON.parse(await readFile(path.resolve('package.json'))).name as string;
            }
            const template = await readFile(inputFile);
            const packageReExports = await PackageReExports.FromPackage(packageName);
            const eol = findEol(await readFile(packageReExports.resolvePath('package.json')));
            // Organize `ReExport`s by `reExportsDir` then by `packageName`:
            const reExportsDirectories: Record<string, Record<string, ReExport[]>> = {};
            for (const reExport of packageReExports.all) {
                let reExportsPackages = reExportsDirectories[reExport.reExportDir];
                if (!reExportsPackages) {
                    reExportsPackages = reExportsDirectories[reExport.reExportDir] = {};
                }
                let reExports = reExportsPackages[reExport.packageName];
                if (!reExports) {
                    reExports = reExportsPackages[reExport.packageName] = [];
                }
                reExports.push(reExport);
            }
            // Map the organized `ReExport`s into a view object for mustache:
            const reExportsView: ReExportsView = {
                reExportsDirectories: Object.entries(reExportsDirectories).map(([directory, reExportsPackages]) => ({
                    directory,
                    // eslint-disable-next-line @typescript-eslint/no-shadow
                    packages: Object.entries(reExportsPackages).map(([packageName, reExports]) => ({
                        packageName,
                        npmUrl: getNpmUrl(packageName, reExports[0].versionRange),
                        versionRange: reExports[0].versionRange,
                        modules: reExports.map(reExport => ({
                            moduleName: reExport.moduleName,
                        }))
                    }))
                }))
            };
            // `console.log` replaces CRLF with LF which is problematic on Windows
            process.stdout.write(convertEol(eol, mustache.render(template, reExportsView)));
        }
    )
    .parse();

interface ReExportsView {
    reExportsDirectories: Array<{
        directory: string
        packages: Array<{
            npmUrl: string
            packageName: string
            modules: Array<{
                moduleName: string
            }>
            versionRange: string
        }>
    }>
}

function getNpmUrl(moduleName: string, versionRange: string | null | undefined): string {
    const [packageName] = parseModule(moduleName);
    let url = `https://www.npmjs.com/package/${packageName}`;
    // Is the range a fixed version?
    const version = versionRange && semver.valid(versionRange);
    if (version) {
        url += `/v/${version}`;
    }
    return url;
}

async function readFile(filePath: string): Promise<string> {
    return fs.promises.readFile(filePath, 'utf8');
}

function findEol(content: string): EOL {
    const match = content.match(/\r\n?|\n/);
    return (match ? match[0] : os.EOL) as EOL;
}

function convertEol(eol: EOL, content: string): string {
    switch (eol) {
        case '\r\n': return content.replace(/(?<!\r)\n|\r(?!\n)/g, '\r\n');
        case '\n': return content.replace(/\r\n?/g, '\n');
        case '\r': return content.replace(/\r?\n/g, '\r');
    }
}

class FileWriter {
    constructor(public eol: EOL) { }
    async write(filePath: string, content: string): Promise<void> {
        const dirPath = path.dirname(filePath);
        await fs.promises.mkdir(dirPath, { recursive: true });
        await fs.promises.writeFile(filePath, convertEol(this.eol, content));
    }
    async remove(...filePaths: string[]): Promise<void> {
        await Promise.all(filePaths.map(filePath => fs.promises.rm(filePath, { force: true })));
    }
}

/**
 * Collects the names of the values exported by the given CommonJS modules from their type declarations.
 */
function collectExportNames(moduleNames: string[], fromDir: string): Map<string, string[]> {
    const result = new Map<string, string[]>();
    if (moduleNames.length === 0) {
        return result;
    }
    // A virtual CommonJS module that requires all modules, so that they are resolved like the generated re-exports.
    // TypeScript uses forward slashes in file names on all platforms.
    const fileName = path.join(fromDir, '__theia_re_exports__.cts').replace(/\\/g, '/');
    const content = moduleNames.map((moduleName, index) => `import m${index} = require('${moduleName}');\nexport { m${index} };\n`).join('');
    const options: ts.CompilerOptions = {
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true,
        types: []
    };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile;
    host.getSourceFile = (name, languageVersion, ...rest) => name === fileName
        ? ts.createSourceFile(name, content, languageVersion)
        : getSourceFile.call(host, name, languageVersion, ...rest);
    const fileExists = host.fileExists;
    host.fileExists = name => name === fileName || fileExists.call(host, name);
    const program = ts.createProgram([fileName], options, host);
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(fileName)!;
    sourceFile.statements.filter(ts.isImportEqualsDeclaration).forEach((statement, index) => {
        const reference = statement.moduleReference;
        const moduleSymbol = ts.isExternalModuleReference(reference) ? checker.getSymbolAtLocation(reference.expression) : undefined;
        if (!moduleSymbol) {
            console.warn(`cannot resolve the types of '${moduleNames[index]}'`);
            return;
        }
        // eslint-disable-next-line no-bitwise
        const isValue = (symbol: ts.Symbol) => ((symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol).flags & ts.SymbolFlags.Value) !== 0;
        const symbols = checker.getExportsOfModule(moduleSymbol).filter(isValue);
        // The properties of the value of an `export =` declaration are named exports, too.
        const exportEquals = moduleSymbol.exports?.get(ts.InternalSymbolName.ExportEquals);
        if (exportEquals) {
            symbols.push(...checker.getTypeOfSymbolAtLocation(exportEquals, statement).getProperties());
        }
        const names = symbols
            .map(symbol => symbol.name)
            .filter(name => name !== 'default' && name !== '__esModule' && /^[A-Za-z_$][\w$]*$/.test(name) && !RESERVED_WORDS.has(name));
        result.set(moduleNames[index], Array.from(new Set(names)).sort());
    });
    return result;
}

const RESERVED_WORDS = new Set(['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
    'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof',
    'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'implements', 'interface', 'package', 'private', 'protected', 'public', 'await']);

/**
 * Determines whether `moduleName` is loaded as a CommonJS module when imported from an ES module in `fromDir`.
 */
function isCommonJsModule(moduleName: string, fromDir: string): boolean {
    const [packageName, subModuleName] = parseModule(moduleName);
    let resolved: string;
    try {
        resolved = require.resolve(moduleName, { paths: [fromDir] });
    } catch {
        return false;
    }
    if (resolved.endsWith('.cjs')) {
        return true;
    }
    if (resolved.endsWith('.mjs')) {
        return false;
    }
    // Find the `package.json` of the package that `moduleName` belongs to.
    let packageRoot = path.dirname(resolved);
    while (!fs.existsSync(path.join(packageRoot, 'package.json'))
        || JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).name !== packageName) {
        if (packageRoot === path.dirname(packageRoot)) {
            return true;
        }
        packageRoot = path.dirname(packageRoot);
    }
    const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    // A dual package provides a separate entry point for the `import` condition, which is an ES module.
    const exportsEntry = typeof packageJson.exports === 'object' && packageJson.exports
        ? packageJson.exports[subModuleName ? `./${subModuleName}` : '.']
        : undefined;
    if (typeof exportsEntry === 'object' && exportsEntry && 'import' in exportsEntry) {
        return false;
    }
    return packageJson.type !== 'module';
}
