// @ts-check
/**
 * ESM migration codemod: convert callable namespace imports to default imports.
 *
 * `esModuleInterop` makes `import * as x from 'cjs-module'` a non-callable namespace
 * object. Where the imported binding is actually CALLED or NEW'd (e.g. `yargs()`,
 * `express()`, `markdownit()`, `assert(...)`), it must become a default import
 * `import x from 'cjs-module'`. Member-only usage (`path.join`) stays as a namespace.
 *
 * This is a mechanical, type-agnostic transform driven purely by syntax:
 *   - find `import * as X from 'M'` (bare specifier, not a relative or @theia path)
 *   - if X is used as a call/new callee anywhere in the file, rewrite to `import X from 'M'`
 *
 * Usage: node scripts/esm/namespace-to-default.mjs [--apply]
 * Without --apply it only reports the changes it would make.
 */
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const apply = process.argv.includes('--apply');

/** @returns {string[]} */
function sourceFiles() {
    const out = execSync('git ls-files packages dev-packages', { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
    const pattern = /^(packages|dev-packages)\/[^/]+\/src\/.*\.tsx?$/;
    return out.split('\n').filter(f => pattern.test(f) && !f.endsWith('.d.ts'));
}

/** Collect identifiers that appear as a call or new callee in the file. */
function collectCalledIdentifiers(sourceFile) {
    const called = new Set();
    /** @param {ts.Node} node */
    const visit = node => {
        if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && node.expression && ts.isIdentifier(node.expression)) {
            called.add(node.expression.text);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return called;
}

let changedFiles = 0;
let changedImports = 0;

for (const file of sourceFiles()) {
    const text = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const called = collectCalledIdentifiers(sf);

    /** @type {{start: number, end: number, name: string, module: string}[]} */
    const edits = [];
    for (const stmt of sf.statements) {
        if (!ts.isImportDeclaration(stmt) || !stmt.importClause) {
            continue;
        }
        const bindings = stmt.importClause.namedBindings;
        if (!bindings || !ts.isNamespaceImport(bindings)) {
            continue;
        }
        const name = bindings.name.text;
        const module = /** @type {ts.StringLiteral} */ (stmt.moduleSpecifier).text;
        // Skip relative imports and internal Theia ESM modules, but DO include the
        // `@theia/.../shared/*` re-export stubs, which re-export CJS modules and thus
        // behave like the underlying callable/constructable CommonJS default.
        const isSharedReexport = module.includes('/shared/');
        if (module.startsWith('.') || (module.startsWith('@theia/') && !isSharedReexport)) {
            continue;
        }
        if (!called.has(name)) {
            continue;
        }
        edits.push({ start: stmt.getStart(sf), end: stmt.getEnd(), name, module });
    }

    if (edits.length === 0) {
        continue;
    }
    let next = text;
    for (const e of edits.sort((a, b) => b.start - a.start)) {
        const replacement = `import ${e.name} from '${e.module}';`;
        next = next.slice(0, e.start) + replacement + next.slice(e.end);
        changedImports++;
        console.log(`${file}: import * as ${e.name} from '${e.module}' -> default`);
    }
    changedFiles++;
    if (apply) {
        writeFileSync(file, next);
    }
}

console.log(`\n${apply ? 'Applied' : 'Would change'} ${changedImports} imports in ${changedFiles} files.`);
