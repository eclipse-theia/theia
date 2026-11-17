// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others
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
// @ts-check

// Report CSS that a package relies on although it ships with a package outside of its dependencies,
// see https://github.com/eclipse-theia/theia/issues/16521. An application that does not contain the
// other package renders the first one unstyled.
//
// A package P may style the markup of another package inside its own UI, but it must not be the only
// place that styles it. Errors:
//
// - class: P renders a class that is only styled by CSS of packages P does not (transitively) depend on.
// - color: P uses a `--theia-*` color variable (in CSS, in TS or as the default of a color it registers)
//   that is only registered by packages P does not depend on.
//
// Warnings, which never fail the check:
//
// - color-fallback: as `color`, but every use has a `var()` fallback.
// - class-bleed: a class of P is restyled globally by a package that depends on P, so P looks different
//   in applications with and without that package.
// - class-unrelated: a class of P is only styled by a package unrelated to P, a name clash or a missing dependency.
//
// Only `dependencies` and `peerDependencies` count, `devDependencies` are not part of an application.
//
// Assumptions and blind spots:
//
// - Every application contains @theia/monaco. Core's ColorRegistry is a no-op without it, so no theme
//   color is defined at all in an application without Monaco. Colors registered by Monaco itself are
//   therefore treated as available to every package.
// - Class names are found in string literals of TS/TSX sources. Class names that are computed at runtime,
//   rules that select elements by tag name only and colors contributed by VS Code extensions are not covered.
//
// Usage: node scripts/check-css-dependencies.js [--exceptions <file.json>] [--report <out.md>]
//
// --exceptions  a JSON array of `{ "kind": "class" | "color", "name": "<class or --theia-variable>", "user"?: "<package>",
//               "reason": "<why>" }` entries for findings that are accepted for now. An entry that matches no
//               finding is an error, so that the file does not outlive its entries.
// --report      writes all findings, variables that are used but never defined and CSS files that are never imported
//               to a Markdown file.
//
// Exits with code 1 when there is an error. Inside GitHub Actions, errors are also printed as workflow annotations.
'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const selectorParser = require('postcss-selector-parser');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
/** @param {string} name */
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const exceptionsFile = option('--exceptions');
const reportFile = option('--report');

/**
 * @template K, V
 * @param {Map<K, Set<V>>} map
 * @param {K} key
 * @param {V} value
 */
function addTo(map, key, value) {
    let values = map.get(key);
    if (!values) {
        values = new Set();
        map.set(key, values);
    }
    values.add(value);
}

/** @param {string} id a color id, e.g. `editor.background` */
const toVar = id => '--theia-' + id.replace(/\./g, '-');
/** @param {string} file */
const rel = file => path.relative(root, file).split(path.sep).join('/');

// ---------- packages and their dependency closure ----------

/** @type {Map<string, { dir: string, deps: string[] }>} */
const packages = new Map();
for (const dir of fs.readdirSync(path.join(root, 'packages'))) {
    const packageJsonPath = path.join(root, 'packages', dir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const deps = Object.keys({ ...packageJson.dependencies, ...packageJson.peerDependencies });
        packages.set(packageJson.name, { dir: path.join(root, 'packages', dir), deps });
    }
}

/** @type {Map<string, Set<string>>} */
const closures = new Map();
/**
 * @param {string} name
 * @returns {Set<string>} the package itself and all packages it transitively depends on
 */
function closure(name) {
    const cached = closures.get(name);
    if (cached) {
        return cached;
    }
    // set before recursing, so that a dependency cycle terminates
    const result = new Set([name]);
    closures.set(name, result);
    for (const dep of packages.get(name)?.deps ?? []) {
        closure(dep).forEach(d => result.add(d));
    }
    return result;
}
/**
 * @param {string} p
 * @param {string} q
 */
const dependsOn = (p, q) => closure(p).has(q);

/**
 * @param {string} dir
 * @param {(name: string) => boolean} filter
 * @param {string[]} out
 * @returns {string[]} the files below `dir` whose name matches `filter`, without `node_modules` and `test` folders
 */
function walk(dir, filter, out = []) {
    if (fs.existsSync(dir)) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules' && entry.name !== 'test') {
                    walk(file, filter, out);
                }
            } else if (filter(entry.name)) {
                out.push(file);
            }
        }
    }
    return out;
}

/**
 * @param {string} text
 * @returns {(offset: number) => number} maps an offset in `text` to its 1-based line
 */
function lineIndex(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') {
            starts.push(i + 1);
        }
    }
    return offset => {
        let low = 0;
        let high = starts.length - 1;
        while (low < high) {
            const middle = (low + high + 1) >> 1;
            if (starts[middle] <= offset) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }
        return low + 1;
    };
}

// ---------- CSS ----------

/**
 * @typedef {{ selector: string, line: number, keyClasses: string[], allClasses: string[], ids: string[] }} CssRule
 * @typedef {{ name: string, line: number, hasFallback: boolean }} VarUse
 * @typedef {{ rules: CssRule[], declaredVars: string[], usedVars: VarUse[], imports: string[] }} CssInfo
 */

/** @type {Map<string, CssInfo>} */
const cssCache = new Map();
/** @param {string} file */
function parseCss(file) {
    let info = cssCache.get(file);
    if (!info) {
        info = doParseCss(file);
        cssCache.set(file, info);
    }
    return info;
}
/**
 * @param {string} file
 * @returns {CssInfo}
 */
function doParseCss(file) {
    // replace comments with whitespace of the same length, to keep the offsets
    const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
    const lineOf = lineIndex(text);
    /** @type {CssRule[]} */
    const rules = [];
    for (const match of text.matchAll(/([^{}]+)\{/g)) {
        // drop statements such as `@import ...;` or declarations of a parent rule in front of the selector
        const raw = match[1].slice(match[1].lastIndexOf(';') + 1);
        const prelude = raw.trim();
        if (!prelude || prelude.startsWith('@') || /^(from|to|[\d.]+%)\b/.test(prelude)) {
            continue;
        }
        const line = lineOf((match.index ?? 0) + match[1].length - raw.length + raw.indexOf(prelude));
        try {
            selectorParser(selectors => {
                selectors.each(selector => {
                    // the key compound, i.e. the element that is actually styled: everything after the last combinator
                    let start = 0;
                    selector.nodes.forEach((node, i) => {
                        if (node.type === 'combinator') {
                            start = i + 1;
                        }
                    });
                    const keyClasses = selector.nodes.slice(start).filter(node => node.type === 'class').map(node => node.value);
                    /** @type {string[]} */
                    const allClasses = [];
                    selector.walkClasses(node => {
                        allClasses.push(node.value);
                    });
                    /** @type {string[]} */
                    const ids = [];
                    selector.walkIds(node => {
                        ids.push(node.value);
                    });
                    rules.push({ selector: selector.toString().trim(), line, keyClasses, allClasses, ids });
                });
            }).processSync(prelude);
        } catch {
            // ignore selectors the parser does not understand
        }
    }
    const declaredVars = [...text.matchAll(/(--theia-[\w-]+)\s*:/g)].map(match => match[1]);
    const usedVars = [...text.matchAll(/var\(\s*(--theia-[\w-]+)\s*(,)?/g)]
        .map(match => ({ name: match[1], line: lineOf(match.index ?? 0), hasFallback: !!match[2] }));
    const imports = [...text.matchAll(/@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)/g)].map(match => match[1]);
    return { rules, declaredVars, usedVars, imports };
}

/**
 * @param {string} specifier
 * @param {string} fromFile
 * @returns {string | undefined} the CSS file that `specifier` refers to
 */
function resolveImport(specifier, fromFile) {
    if (specifier.startsWith('.') || (!specifier.startsWith('@') && !specifier.includes('/'))) {
        const candidate = path.resolve(path.dirname(fromFile), specifier);
        return fs.existsSync(candidate) ? candidate : undefined;
    }
    try {
        return require.resolve(specifier, { paths: [path.dirname(fromFile)] });
    } catch {
        // `@theia/x/src/...` of a workspace package
        const [scope, name, ...rest] = specifier.split('/');
        const pkg = packages.get(`${scope}/${name}`);
        const candidate = pkg && path.join(pkg.dir, ...rest);
        return candidate && fs.existsSync(candidate) ? candidate : undefined;
    }
}

// ---------- TS/TSX ----------

const CLASS_CONTEXT = /^(className|class|addClass|removeClass|toggleClass|add|remove|toggle|contains|classList|classes|iconClass|iconClasses|cssClass|codicon)$/i;
const COLOR_ID = /^[a-zA-Z][\w-]*(\.[\w-]+)+$/;

/** @type {Map<string, import('typescript').SourceFile>} */
const sourceCache = new Map();
/** @param {string} file */
function sourceOf(file) {
    let source = sourceCache.get(file);
    if (!source) {
        const text = fs.readFileSync(file, 'utf8');
        source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        sourceCache.set(file, source);
    }
    return source;
}
/**
 * @param {import('typescript').Node} node
 * @returns {string | undefined}
 */
function nameOf(node) {
    const name = /** @type {{ name?: import('typescript').Node }} */ (node).name;
    return name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : undefined;
}

// string constants and object literal keys by identifier, to resolve `id: ScmColors.foo` or `for (const id in colorMap)`
/** @type {Map<string, Set<string>>} */
const constants = new Map();
/** @type {Map<string, Set<string>>} */
const objectKeys = new Map();
/** @param {string} file */
function collectConstants(file) {
    /** @param {import('typescript').Node} node */
    const visit = node => {
        const name = nameOf(node);
        if ((ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) && node.initializer && name) {
            const initializer = node.initializer;
            if (ts.isStringLiteralLike(initializer)) {
                addTo(constants, name, initializer.text);
            } else if (ts.isObjectLiteralExpression(initializer)) {
                for (const property of initializer.properties) {
                    const key = nameOf(property);
                    if (key) {
                        addTo(objectKeys, name, key);
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceOf(file));
}
/**
 * @param {import('typescript').Expression | undefined} expression
 * @returns {string[]} the string value of a literal or of a constant with a unique value
 */
function resolveString(expression) {
    if (!expression) {
        return [];
    }
    if (ts.isStringLiteralLike(expression)) {
        return [expression.text];
    }
    const name = ts.isPropertyAccessExpression(expression) ? expression.name.text : ts.isIdentifier(expression) ? expression.text : undefined;
    const values = name && constants.get(name);
    return values && values.size === 1 ? [...values] : [];
}

/** @param {string} file */
function collectTs(file) {
    const source = sourceOf(file);
    /** @param {number} position */
    const lineOf = position => source.getLineAndCharacterOfPosition(position).line + 1;
    const registersColors = source.text.includes('ColorRegistry');
    /** @type {Map<string, number>} class -> line */
    const classes = new Map();
    /** @type {Set<string>} */
    const colorIds = new Set();
    /** @type {{ id: string, line: number }[]} references to other colors in color defaults */
    const colorRefs = [];
    /** @type {Set<string>} */
    const declaredVars = new Set();
    /** @type {VarUse[]} */
    const usedVars = [];
    /** @type {string[]} */
    const cssImports = [];
    /** @type {Set<string>} object literals iterated over in a color registration file */
    const loopMaps = new Set();
    /**
     * @param {import('typescript').Node} node
     * @returns {string} the name of the attribute, property, variable or function that a string is passed to
     */
    const contextName = node => {
        for (let parent = node.parent, depth = 0; parent && depth < 4; parent = parent.parent, depth++) {
            if (ts.isJsxAttribute(parent)) {
                return parent.name.getText();
            }
            if (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isVariableDeclaration(parent)) {
                return parent.name.getText();
            }
            if (ts.isBinaryExpression(parent) && ts.isPropertyAccessExpression(parent.left)) {
                return parent.left.name.getText();
            }
            if (ts.isCallExpression(parent)) {
                return ts.isPropertyAccessExpression(parent.expression) ? parent.expression.name.getText() : parent.expression.getText();
            }
        }
        return '';
    };
    /** @param {import('typescript').Node} node */
    const insideDefaults = node => {
        for (let parent = node.parent, depth = 0; parent && depth < 8; parent = parent.parent, depth++) {
            if (ts.isPropertyAssignment(parent) && nameOf(parent) === 'defaults') {
                return true;
            }
        }
        return false;
    };
    /** @param {import('typescript').Node} node */
    const visit = node => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.endsWith('.css')) {
            cssImports.push(node.moduleSpecifier.text);
        }
        if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text.endsWith('.css')
            && ['require', 'import'].includes(node.expression.getText())) {
            cssImports.push(node.arguments[0].text);
        }
        if (ts.isCallExpression(node) && node.expression.getText() === 'codicon' && node.arguments.length && ts.isStringLiteralLike(node.arguments[0])) {
            classes.set('codicon-' + node.arguments[0].text, lineOf(node.getStart()));
        }
        if (registersColors) {
            if (ts.isPropertyAssignment(node) && nameOf(node) === 'id' && ts.isObjectLiteralExpression(node.parent)
                && node.parent.properties.some(property => nameOf(property) === 'defaults' || nameOf(property) === 'description')) {
                resolveString(node.initializer).forEach(id => colorIds.add(id));
            }
            if (ts.isForInStatement(node) || (ts.isCallExpression(node) && /^Object\.(keys|entries)$/.test(node.expression.getText()))) {
                const target = ts.isForInStatement(node) ? node.expression : node.arguments[0];
                if (target && ts.isIdentifier(target)) {
                    loopMaps.add(target.text);
                }
            }
            if (insideDefaults(node) && (ts.isStringLiteralLike(node) || ts.isPropertyAccessExpression(node)) && !ts.isPropertyAccessExpression(node.parent)) {
                for (const id of resolveString(node)) {
                    if (COLOR_ID.test(id) || ts.isPropertyAccessExpression(node)) {
                        colorRefs.push({ id, line: lineOf(node.getStart()) });
                    }
                }
            }
        }
        if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
            const value = node.text;
            const context = contextName(node);
            for (const token of value.split(/\s+/)) {
                if (/^-?[A-Za-z_][\w-]*$/.test(token) && (/[-_]/.test(token) || CLASS_CONTEXT.test(context) || /class/i.test(context)) && !classes.has(token)) {
                    classes.set(token, lineOf(node.getStart()));
                }
            }
            if (/^--theia-[\w-]+$/.test(value)) {
                declaredVars.add(value);
            }
            for (const match of value.matchAll(/(--theia-[\w-]+)\s*:/g)) {
                declaredVars.add(match[1]);
            }
            for (const match of value.matchAll(/var\(\s*(--theia-[\w-]+)\s*(,)?/g)) {
                usedVars.push({ name: match[1], line: lineOf(node.getStart()), hasFallback: !!match[2] });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    for (const map of loopMaps) {
        for (const key of objectKeys.get(map) ?? []) {
            if (COLOR_ID.test(key)) {
                colorIds.add(key);
            }
        }
    }
    return { classes, colorIds, colorRefs, declaredVars, usedVars, cssImports };
}

/** @returns {Set<string>} the variables of the colors that Monaco registers itself */
function monacoColorVars() {
    const result = new Set();
    const monacoDir = path.dirname(require.resolve('@theia/monaco-editor-core/package.json', { paths: [root] }));
    for (const file of walk(path.join(monacoDir, 'esm'), name => name.endsWith('.js'))) {
        const text = fs.readFileSync(file, 'utf8');
        if (text.includes('registerColor')) {
            for (const match of text.matchAll(/registerColor\(\s*['"]([\w.-]+)['"]/g)) {
                result.add(toVar(match[1]));
            }
        }
    }
    return result;
}

// ---------- collect ----------

/** @param {string} name */
const isSourceFile = name => /\.tsx?$/.test(name) && !/\.(spec|ui-spec|slow-spec)\.tsx?$/.test(name) && !name.endsWith('.d.ts');

const tsFiles = new Map([...packages].map(([name, pkg]) => [name, walk(path.join(pkg.dir, 'src'), isSourceFile)]));
tsFiles.forEach(files => files.forEach(collectConstants));

/** @typedef {{ pkg: string, file: string, line: number, selector: string, allClasses: string[], ids: string[] }} StylingRule */
/** @type {Map<string, StylingRule[]>} class -> rules whose key compound contains it */
const keyRulesByClass = new Map();
/** @type {Map<string, Map<string, string>>} class -> package -> first location that renders it */
const renderedBy = new Map();
/** @type {Map<string, Set<string>>} variable -> packages that define it */
const varDefinedBy = new Map();
/** @type {{ pkg: string, location: string, name: string, hasFallback: boolean, via: string }[]} */
const varUses = [];
/** @type {Map<string, Set<string>>} CSS file -> packages that import it */
const cssOwners = new Map();

for (const [name, files] of tsFiles) {
    /** @type {Set<string>} */
    const reached = new Set();
    /** @param {string | undefined} file */
    const reach = file => {
        if (file && file.endsWith('.css') && !reached.has(file)) {
            reached.add(file);
            parseCss(file).imports.forEach(specifier => reach(resolveImport(specifier, file)));
        }
    };
    for (const file of files) {
        const info = collectTs(file);
        info.cssImports.forEach(specifier => reach(resolveImport(specifier, file)));
        for (const [token, line] of info.classes) {
            let byPackage = renderedBy.get(token);
            if (!byPackage) {
                byPackage = new Map();
                renderedBy.set(token, byPackage);
            }
            if (!byPackage.has(name)) {
                byPackage.set(name, `${rel(file)}:${line}`);
            }
        }
        info.colorIds.forEach(id => addTo(varDefinedBy, toVar(id), name));
        info.declaredVars.forEach(variable => addTo(varDefinedBy, variable, name));
        info.usedVars.forEach(use => varUses.push({ pkg: name, location: `${rel(file)}:${use.line}`, name: use.name, hasFallback: use.hasFallback, via: 'var() in TS' }));
        info.colorRefs.forEach(ref => varUses.push({ pkg: name, location: `${rel(file)}:${ref.line}`, name: toVar(ref.id), hasFallback: false, via: 'color default' }));
    }
    reached.forEach(file => addTo(cssOwners, file, name));
}
for (const [file, owners] of cssOwners) {
    const { rules, declaredVars, usedVars } = parseCss(file);
    for (const pkg of owners) {
        for (const rule of rules) {
            for (const cls of rule.keyClasses) {
                let classRules = keyRulesByClass.get(cls);
                if (!classRules) {
                    classRules = [];
                    keyRulesByClass.set(cls, classRules);
                }
                classRules.push({ pkg, file: rel(file), line: rule.line, selector: rule.selector, allClasses: rule.allClasses, ids: rule.ids });
            }
        }
        declaredVars.forEach(variable => addTo(varDefinedBy, variable, pkg));
        usedVars.forEach(use => varUses.push({ pkg, location: `${rel(file)}:${use.line}`, name: use.name, hasFallback: use.hasFallback, via: 'var() in CSS' }));
    }
}
const unimportedCss = [...packages.values()].flatMap(pkg => walk(path.join(pkg.dir, 'src'), name => name.endsWith('.css'))).filter(file => !cssOwners.has(file));
const monacoVars = monacoColorVars();

// ---------- analyse ----------

/**
 * @typedef {'class' | 'color' | 'color-fallback' | 'class-bleed' | 'class-unrelated'} FindingKind
 * @typedef {{ severity: 'error' | 'warning', kind: FindingKind, name: string, user: string, owner: string[], location: string,
 *     evidence: string[], message: string, excepted?: string }} Finding
 */
/** @type {Finding[]} */
const findings = [];
/**
 * @param {{ pkg: string }[]} rules
 * @returns {string[]} the distinct packages of the rules
 */
const packagesOf = rules => [...new Set(rules.map(rule => rule.pkg))];

for (const [cls, renderers] of renderedBy) {
    const rules = keyRulesByClass.get(cls);
    if (!rules) {
        continue;
    }
    for (const [p, location] of renderers) {
        const inClosure = rules.filter(rule => dependsOn(p, rule.pkg));
        // a selector that mentions a class or id of Q's own markup styles P's element only inside Q's UI,
        // e.g. `.q-dialog .p-chevron` or `#q-view .p-item`: a customization, not a dependency
        const foreign = rules.filter(rule => !dependsOn(p, rule.pkg) && ![...rule.allClasses, ...rule.ids].some(c => renderedBy.get(c)?.has(rule.pkg)));
        const extending = foreign.filter(rule => dependsOn(rule.pkg, p));
        const unrelated = foreign.filter(rule => !dependsOn(rule.pkg, p));
        // a restyling only counts when the whole selector is made of P's markup, `.xterm .active` is about another library
        /** @param {string} c */
        const ownedByP = c => [...renderedBy.get(c)?.keys() ?? []].some(renderer => dependsOn(p, renderer));
        const bleeding = extending.filter(rule => rule.allClasses.every(ownedByP));
        /** @param {StylingRule[]} styling */
        const evidence = styling => styling.slice(0, 3).map(rule => `${rule.file}:${rule.line} \`${rule.selector}\``);
        if (!inClosure.length && extending.length) {
            const owners = packagesOf(extending);
            findings.push({
                severity: 'error', kind: 'class', name: cls, user: p, owner: owners, location, evidence: evidence(extending),
                message: `class '${cls}' is used in ${p} but only styled in ${owners.join(', ')} (${extending[0].file}:${extending[0].line}), which ${p} does not depend on. `
                    + `Move the rule to ${p} or to a package it depends on.`
            });
        } else if (!inClosure.length && unrelated.length) {
            const owners = packagesOf(unrelated);
            findings.push({
                severity: 'warning', kind: 'class-unrelated', name: cls, user: p, owner: owners, location, evidence: evidence(unrelated),
                message: `class '${cls}' is used in ${p} and only styled in the unrelated ${owners.join(', ')}: a name clash or a missing dependency`
            });
        } else if (inClosure.length && bleeding.length) {
            const owners = packagesOf(bleeding);
            findings.push({
                severity: 'warning', kind: 'class-bleed', name: cls, user: p, owner: owners, location, evidence: evidence(bleeding),
                message: `class '${cls}' of ${p} is restyled globally by ${owners.join(', ')}, so it looks different in applications with and without ${owners.join(', ')}`
            });
        }
    }
}

/** @type {Map<string, Set<string>>} variable -> locations */
const undefinedVars = new Map();
/** @type {Map<string, { definers: string[], uses: typeof varUses }>} */
const colorGroups = new Map();
for (const use of varUses) {
    if (monacoVars.has(use.name)) {
        continue;
    }
    const definers = varDefinedBy.get(use.name);
    if (!definers) {
        addTo(undefinedVars, use.name, use.location + (use.hasFallback ? ' (has fallback)' : ''));
        continue;
    }
    if ([...definers].some(definer => dependsOn(use.pkg, definer))) {
        continue;
    }
    const key = `${use.pkg}|${use.name}`;
    let group = colorGroups.get(key);
    if (!group) {
        group = { definers: [...definers], uses: [] };
        colorGroups.set(key, group);
    }
    group.uses.push(use);
}
for (const { definers, uses } of colorGroups.values()) {
    const { pkg, name } = uses[0];
    const hard = uses.filter(use => !use.hasFallback);
    const first = hard[0] ?? uses[0];
    findings.push({
        severity: hard.length ? 'error' : 'warning', kind: hard.length ? 'color' : 'color-fallback', name, user: pkg, owner: definers,
        location: first.location, evidence: uses.slice(0, 3).map(use => `${use.location} (${use.via}${use.hasFallback ? ', has fallback' : ''})`),
        message: `color '${name}' is used in ${pkg} (${first.via}) but only registered in ${definers.join(', ')}, which ${pkg} does not depend on. `
            + (hard.length ? `Register the color in ${pkg} or in a package it depends on.` : 'Mitigated by a var() fallback.')
    });
}

// ---------- exceptions ----------

/** @type {{ kind: FindingKind, name: string, user?: string, reason: string }[]} */
const exceptions = exceptionsFile ? JSON.parse(fs.readFileSync(exceptionsFile, 'utf8')) : [];
const usedExceptions = new Set();
for (const finding of findings) {
    const exception = exceptions.find(e => e.kind === finding.kind && e.name === finding.name && (!e.user || e.user === finding.user));
    if (exception) {
        finding.excepted = exception.reason;
        usedExceptions.add(exception);
    }
}
const staleExceptions = exceptions.filter(e => !usedExceptions.has(e));

// ---------- report ----------

/**
 * @param {Finding} a
 * @param {Finding} b
 */
const order = (a, b) => a.user.localeCompare(b.user) || a.name.localeCompare(b.name);
const errors = findings.filter(finding => finding.severity === 'error' && !finding.excepted).sort(order);
const warnings = findings.filter(finding => finding.severity === 'warning' || finding.excepted).sort(order);
for (const finding of errors) {
    console.log(`error    ${finding.location}  ${finding.message}`);
    if (process.env.GITHUB_ACTIONS) {
        const [file, line] = finding.location.split(':');
        console.log(`::error file=${file},line=${line},title=CSS dependency::${finding.message}`);
    }
}
for (const exception of staleExceptions) {
    console.log(`error    ${exceptionsFile}  the exception for ${exception.kind} '${exception.name}' matches no finding anymore, remove it.`);
}
for (const finding of warnings) {
    console.log(`warning  ${finding.location}  ${finding.excepted ? `${finding.message} (excepted: ${finding.excepted})` : finding.message}`);
}
console.log(`\nCSS dependencies: ${errors.length + staleExceptions.length} error(s), ${warnings.length} warning(s), `
    + `${undefinedVars.size} variable(s) used but never defined (see --report)`);

if (reportFile) {
    /** @type {string[]} */
    const out = [];
    /**
     * @template T
     * @param {string} title
     * @param {T[]} items
     * @param {(item: T) => string} format
     */
    const section = (title, items, format) => {
        out.push(`\n### ${title} (${items.length})\n`);
        items.forEach(item => out.push(format(item)));
    };
    /** @param {Finding} finding */
    const formatFinding = finding => `- **${finding.user}** → \`${finding.name}\` (owner: ${finding.owner.join(', ')})${finding.excepted ? ` _excepted: ${finding.excepted}_` : ''}\n`
        + `  - used: \`${finding.location}\`\n`
        + finding.evidence.map(e => `  - ${finding.kind.startsWith('color') ? '' : 'styled: '}${e}`).join('\n');
    /** @param {FindingKind} kind */
    const ofKind = kind => findings.filter(finding => finding.kind === kind).sort(order);
    section('Class used in P, styled only by a package P does not depend on', ofKind('class'), formatFinding);
    section('Color used in P, registered only by a package P does not depend on', ofKind('color'), formatFinding);
    section('Same, but mitigated by a var() fallback', ofKind('color-fallback'), formatFinding);
    section('Class of P restyled globally by a package depending on P', ofKind('class-bleed'), formatFinding);
    section('Class of P styled only by an unrelated package', ofKind('class-unrelated'), formatFinding);
    section('Variables used but defined nowhere (typos, dead CSS or runtime-only definitions)', [...undefinedVars].sort(),
        ([name, uses]) => `- \`${name}\` ${[...uses].slice(0, 2).map(use => `\`${use}\``).join(', ')}`);
    section('CSS files under src/ that no module imports', unimportedCss.map(rel).sort(), file => `- \`${file}\``);
    fs.writeFileSync(reportFile, out.join('\n') + '\n');
}

process.exitCode = errors.length || staleExceptions.length ? 1 : 0;
