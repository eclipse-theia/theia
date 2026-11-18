// @ts-check
/**
 * ESM migration codemod: make TypeScript sources valid for `module: NodeNext` in `"type": "module"` packages.
 *
 * For every `.ts`/`.tsx` file below `<package>/src` of the given packages:
 *   - add explicit `.js` (or `/index.js`) extensions to relative module specifiers in imports, re-exports,
 *     dynamic `import()` calls and `import('...')` type references, and to deep imports into packages
 *     without an `exports` map
 *   - convert `import x = require('m')` into `import x from 'm'` when `x` is used as a value on its own
 *     (called, constructed or passed around) and into `import * as x from 'm'` otherwise
 *   - replace `__dirname` and `__filename` with `import.meta.dirname` and `import.meta.filename`
 *
 * Remaining CommonJS constructs (`require(...)`, `require.resolve(...)`, `module.exports`) are only reported,
 * as they need a case-by-case decision.
 *
 * Usage: node scripts/esm/to-esm.mjs [--apply] <package-dir>...
 * Without --apply it only reports the changes it would make.
 */
import ts from 'typescript';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

const apply = process.argv.includes('--apply');
const packageDirs = process.argv.slice(2).filter(arg => !arg.startsWith('--'));

/** @param {string} packageDir @returns {string[]} */
function sourceFiles(packageDir) {
    const out = execSync(`git ls-files -- '${packageDir}/src'`, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
    return out.split('\n').filter(f => /\.tsx?$/.test(f));
}

const isFile = (/** @type {string} */ path) => existsSync(path) && statSync(path).isFile();
const isDirectory = (/** @type {string} */ path) => existsSync(path) && statSync(path).isDirectory();

/**
 * @param {string} fromFile
 * @param {string} packageName
 * @returns {string | undefined} the directory of the package as resolved from `fromFile`, if it can be found
 */
function findPackageDir(fromFile, packageName) {
    let dir = dirname(resolve(fromFile));
    while (true) {
        const candidate = join(dir, 'node_modules', packageName);
        if (isFile(join(candidate, 'package.json'))) {
            return candidate;
        }
        if (dir === dirname(dir)) {
            return undefined;
        }
        dir = dirname(dir);
    }
}

/**
 * Deep imports into packages without an `exports` map need the complete file name in ES modules,
 * e.g. `@theia/monaco-editor-core/esm/vs/base/common/lifecycle.js`.
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {string | undefined} the rewritten specifier or `undefined` if it does not need to change
 */
function resolveBareSpecifier(fromFile, specifier) {
    if (specifier.startsWith('.') || specifier.startsWith('node:') || specifier.startsWith('/')) {
        return undefined;
    }
    const parts = specifier.split('/');
    const nameLength = specifier.startsWith('@') ? 2 : 1;
    if (parts.length <= nameLength) {
        return undefined;
    }
    const packageName = parts.slice(0, nameLength).join('/');
    const subPath = parts.slice(nameLength).join('/');
    const packageDir = findPackageDir(fromFile, packageName);
    if (!packageDir || JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')).exports !== undefined) {
        return undefined;
    }
    const target = join(packageDir, subPath);
    if (isFile(target)) {
        return undefined;
    }
    if (isFile(target + '.js')) {
        return specifier + '.js';
    }
    if (isDirectory(target) && isFile(join(target, 'index.js'))) {
        return specifier.replace(/\/$/, '') + '/index.js';
    }
    return undefined;
}

/**
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {string | undefined} the rewritten specifier or `undefined` if it does not need to change
 */
function resolveRelativeSpecifier(fromFile, specifier) {
    if (!specifier.startsWith('./') && !specifier.startsWith('../') && specifier !== '.' && specifier !== '..') {
        return resolveBareSpecifier(fromFile, specifier);
    }
    const base = resolve(dirname(fromFile), specifier);
    // Already a complete file name, e.g. `./style/index.css`, `./foo.js` or `./data.json`.
    if (/\.(m|c)?js$|\.(json|css|less|svg|png|html|txt|md|node|wasm)$/.test(specifier) && isFile(base)) {
        return undefined;
    }
    for (const ext of ['.ts', '.tsx', '.d.ts', '.js']) {
        if (isFile(base + ext)) {
            return specifier + '.js';
        }
    }
    if (isDirectory(base)) {
        for (const index of ['index.ts', 'index.tsx', 'index.d.ts', 'index.js']) {
            if (isFile(join(base, index))) {
                return specifier.replace(/\/$/, '') + '/index.js';
            }
        }
    }
    return undefined;
}

/**
 * Determines whether the import-equals binding `name` is used as a value on its own,
 * i.e. other than as the object of a property access or as a type/namespace qualifier.
 * @param {ts.SourceFile} sourceFile
 * @param {string} name
 * @param {ts.Node} declaration
 */
function isUsedAsWholeValue(sourceFile, name, declaration) {
    let used = false;
    /** @param {ts.Node} node */
    const visit = node => {
        if (used || node === declaration) {
            return;
        }
        if (ts.isIdentifier(node) && node.text === name) {
            const parent = node.parent;
            const isPropertyAccessObject = ts.isPropertyAccessExpression(parent) && parent.expression === node;
            const isQualifier = ts.isQualifiedName(parent) && parent.left === node;
            const isPropertyName = (ts.isPropertyAccessExpression(parent) && parent.name === node)
                || (ts.isPropertyAssignment(parent) && parent.name === node)
                || (ts.isMethodDeclaration(parent) && parent.name === node)
                || (ts.isPropertyDeclaration(parent) && parent.name === node)
                || (ts.isPropertySignature(parent) && parent.name === node)
                || (ts.isBindingElement(parent) && parent.propertyName === node);
            const isTypeQuery = ts.isTypeQueryNode(parent);
            if (!isPropertyAccessObject && !isQualifier && !isPropertyName && !isTypeQuery) {
                used = true;
                return;
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return used;
}

/** @type {Record<string, number>} */
const stats = { specifiers: 0, importEquals: 0, dirname: 0, filename: 0, files: 0 };
/** @type {string[]} */
const leftovers = [];

for (const packageDir of packageDirs) {
    for (const file of sourceFiles(packageDir)) {
        const text = readFileSync(file, 'utf8');
        const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        /** @type {{ start: number, end: number, text: string }[]} */
        const edits = [];

        /** @param {ts.Node | undefined} literal */
        const rewriteSpecifier = literal => {
            if (literal && ts.isStringLiteralLike(literal)) {
                const next = resolveRelativeSpecifier(file, literal.text);
                if (next !== undefined && next !== literal.text) {
                    const quote = text[literal.getStart(sourceFile)];
                    edits.push({ start: literal.getStart(sourceFile), end: literal.getEnd(), text: `${quote}${next}${quote}` });
                    stats.specifiers++;
                }
            }
        };

        /** @param {ts.Node} node */
        const visit = node => {
            if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
                rewriteSpecifier(node.moduleSpecifier);
            } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
                rewriteSpecifier(node.arguments[0]);
            } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
                rewriteSpecifier(node.argument.literal);
            } else if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name) && node.name.text.startsWith('.')) {
                rewriteSpecifier(node.name);
            } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
                const expression = node.moduleReference.expression;
                if (ts.isStringLiteralLike(expression)) {
                    const module = resolveRelativeSpecifier(file, expression.text) ?? expression.text;
                    const name = node.name.text;
                    const typeOnly = node.isTypeOnly ? 'type ' : '';
                    const exported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
                    const asDefault = isUsedAsWholeValue(sourceFile, name, node);
                    const clause = asDefault ? name : `* as ${name}`;
                    let replacement = `import ${typeOnly}${clause} from '${module}';`;
                    if (exported) {
                        replacement += `\nexport { ${name} };`;
                    }
                    edits.push({ start: node.getStart(sourceFile), end: node.getEnd(), text: replacement });
                    stats.importEquals++;
                }
            } else if (ts.isIdentifier(node) && (node.text === '__dirname' || node.text === '__filename')) {
                const parent = node.parent;
                const isDeclarationName = (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isPropertyDeclaration(parent)
                    || ts.isPropertyAssignment(parent) || ts.isPropertyAccessExpression(parent) || ts.isBindingElement(parent))
                    && /** @type {any} */ (parent).name === node;
                if (!isDeclarationName) {
                    if (ts.isShorthandPropertyAssignment(parent)) {
                        edits.push({ start: node.getStart(sourceFile), end: node.getEnd(), text: `${node.text}: import.meta.${node.text.substring(2)}` });
                    } else {
                        edits.push({ start: node.getStart(sourceFile), end: node.getEnd(), text: `import.meta.${node.text.substring(2)}` });
                    }
                    stats[node.text.substring(2)]++;
                }
            } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
                leftovers.push(`${file}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: ${node.getText(sourceFile).slice(0, 100)}`);
            } else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
                && (node.expression.text === 'require' || (node.expression.text === 'module' && node.name.text === 'exports'))) {
                leftovers.push(`${file}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: ${node.getText(sourceFile).slice(0, 100)}`);
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);

        if (edits.length === 0) {
            continue;
        }
        let next = text;
        for (const edit of edits.sort((a, b) => b.start - a.start)) {
            next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
        }
        stats.files++;
        if (apply) {
            writeFileSync(file, next);
        }
    }
}

console.log(`${apply ? 'Changed' : 'Would change'} ${stats.files} files: ${stats.specifiers} specifiers, `
    + `${stats.importEquals} import-equals, ${stats.dirname} __dirname, ${stats.filename} __filename.`);
if (leftovers.length) {
    console.log(`\n${leftovers.length} CommonJS constructs need manual migration:`);
    console.log(leftovers.join('\n'));
}
