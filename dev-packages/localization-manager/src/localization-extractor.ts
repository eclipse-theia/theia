// *****************************************************************************
// Copyright (C) 2021 TypeFox and others.
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

import * as fs from 'fs-extra';
import * as ts from 'typescript';
import * as os from 'os';
import * as path from 'path';
import { glob } from 'glob';
import { promisify } from 'util';
import deepmerge = require('deepmerge');
import { Localization, sortLocalization } from './common';

const globPromise = promisify(glob);

export interface ExtractionOptions {
    root?: string
    output?: string
    exclude?: string
    logs?: string
    /** List of globs matching the files to extract from. */
    files?: string[]
    merge?: boolean
    quiet?: boolean
}

class SingleFileServiceHost implements ts.LanguageServiceHost {

    private file: ts.IScriptSnapshot;
    private lib: ts.IScriptSnapshot;

    constructor(private options: ts.CompilerOptions, private filename: string, contents: string) {
        this.file = ts.ScriptSnapshot.fromString(contents);
        this.lib = ts.ScriptSnapshot.fromString('');
    }

    getCompilationSettings = () => this.options;
    getScriptFileNames = () => [this.filename];
    getScriptVersion = () => '1';
    getScriptSnapshot = (name: string) => name === this.filename ? this.file : this.lib;
    getCurrentDirectory = () => '';
    getDefaultLibFileName = () => 'lib.d.ts';
    readFile(file: string, encoding?: string | undefined): string | undefined {
        if (file === this.filename) {
            return this.file.getText(0, this.file.getLength());
        }
    }
    fileExists(file: string): boolean {
        return this.filename === file;
    }
}

class TypeScriptError extends Error {
    constructor(message: string, node: ts.Node) {
        super(buildErrorMessage(message, node));
    }
}

function buildErrorMessage(message: string, node: ts.Node): string {
    const source = node.getSourceFile();
    const sourcePath = source.fileName;
    const pos = source.getLineAndCharacterOfPosition(node.pos);
    return `${sourcePath}(${pos.line + 1},${pos.character + 1}): ${message}`;
}

const tsOptions: ts.CompilerOptions = {
    allowJs: true
};

export async function extract(options: ExtractionOptions): Promise<void> {
    const cwd = path.resolve(process.env.INIT_CWD || process.cwd(), options.root ?? '');
    const files: string[] = [];
    await Promise.all((options.files ?? ['**/src/**/*.{ts,tsx}']).map(
        async pattern => files.push(...await globPromise(pattern, { cwd }))
    ));
    let localization: Localization = {};
    const errors: string[] = [];
    for (const file of files) {
        const filePath = path.resolve(cwd, file);
        const fileName = path.relative(cwd, file).split(path.sep).join('/');
        const content = await fs.readFile(filePath, 'utf8');
        const fileLocalization = await extractFromFile(fileName, content, errors, options);
        localization = deepmerge(localization, fileLocalization);
    }
    if (errors.length > 0 && options.logs) {
        await fs.writeFile(options.logs, errors.join(os.EOL));
    }
    const out = path.resolve(process.env.INIT_CWD || process.cwd(), options.output ?? '');
    if (options.merge && await fs.pathExists(out)) {
        const existing = await fs.readJson(out);
        localization = deepmerge(existing, localization);
    }
    localization = sortLocalization(localization);
    await fs.mkdirs(path.dirname(out));
    await fs.writeJson(out, localization, {
        spaces: 2
    });
}

export async function extractFromFile(file: string, content: string, errors?: string[], options?: ExtractionOptions): Promise<Localization> {
    const serviceHost = new SingleFileServiceHost(tsOptions, file, content);
    const service = ts.createLanguageService(serviceHost);
    const sourceFile = service.getProgram()!.getSourceFile(file)!;
    const localization: Localization = {};
    const localizationCalls = collect(sourceFile, node => isLocalizeCall(node));
    for (const call of localizationCalls) {
        try {
            const extracted = extractFromLocalizeCall(call, options);
            if (extracted) {
                insert(localization, extracted);
            }
        } catch (err) {
            const tsError = err as Error;
            errors?.push(tsError.message);
            if (!options?.quiet) {
                console.log(tsError.message);
            }
        }
    }
    const localizedCommands = collect(sourceFile, node => isCommandLocalizeUtility(node));
    for (const command of localizedCommands) {
        try {
            const extracted = extractFromLocalizedCommandCall(command, errors, options);
            const label = extracted.label;
            const category = extracted.category;
            if (!isExcluded(options, label[0])) {
                insert(localization, label);
            }
            if (category && !isExcluded(options, category[0])) {
                insert(localization, category);
            }
        } catch (err) {
            const tsError = err as Error;
            errors?.push(tsError.message);
            if (!options?.quiet) {
                console.log(tsError.message);
            }
        }
    }
    return localization;
}

function isExcluded(options: ExtractionOptions | undefined, key: string): boolean {
    return !!options?.exclude && key.startsWith(options.exclude);
}

function insert(localization: Localization, values: [string, string, ts.Node]): void {
    const key = values[0];
    const value = values[1];
    const node = values[2];
    const parts = key.split('/');
    parts.forEach((part, i) => {
        let entry = localization[part];
        if (i === parts.length - 1) {
            if (typeof entry === 'object') {
                throw new TypeScriptError(`Multiple translation keys already exist at '${key}'`, node);
            }
            localization[part] = value;
        } else {
            if (typeof entry === 'string') {
                throw new TypeScriptError(`String entry already exists at '${parts.splice(0, i + 1).join('/')}'`, node);
            }
            if (!entry) {
                entry = {};
            }
            localization[part] = entry;
            localization = entry;
        }
    });
}

function collect(n: ts.Node, fn: (node: ts.Node) => boolean): ts.Node[] {
    const result: ts.Node[] = [];

    function loop(node: ts.Node): void {

        const stepResult = fn(node);

        if (stepResult) {
            result.push(node);
        } else {
            ts.forEachChild(node, loop);
        }
    }

    loop(n);
    return result;
}

function isLocalizeCall(node: ts.Node): boolean {
    if (!ts.isCallExpression(node)) {
        return false;
    }

    return node.expression.getText() === 'nls.localize';
}

function extractFromLocalizeCall(node: ts.Node, options?: ExtractionOptions): [string, string, ts.Node] | undefined {
    if (!ts.isCallExpression(node)) {
        throw new TypeScriptError('Invalid node type', node);
    }
    const args = node.arguments;

    if (args.length < 2) {
        throw new TypeScriptError('Localize call needs at least 2 arguments', node);
    }

    const key = extractString(args[0]);
    const value = extractString(args[1]);

    if (isExcluded(options, key)) {
        return undefined;
    }

    return [key, value, args[1]];
}

function extractFromLocalizedCommandCall(node: ts.Node, errors?: string[], options?: ExtractionOptions): {
    label: [string, string, ts.Node],
    category?: [string, string, ts.Node]
} {
    if (!ts.isCallExpression(node)) {
        throw new TypeScriptError('Invalid node type', node);
    }
    const args = node.arguments;

    if (args.length < 1) {
        throw new TypeScriptError('Command localization call needs at least one argument', node);
    }

    const commandObj = args[0];

    if (!ts.isObjectLiteralExpression(commandObj)) {
        throw new TypeScriptError('First argument of "toLocalizedCommand" needs to be an object literal', node);
    }

    const properties = commandObj.properties;
    const propertyMap = new Map<string, string>();
    const relevantProps = ['id', 'label', 'category'];
    let labelNode: ts.Node = node;

    for (const property of properties) {
        if (!property.name) {
            continue;
        }
        if (!ts.isPropertyAssignment(property)) {
            throw new TypeScriptError('Only property assignments in "toLocalizedCommand" are allowed', property);
        }
        if (!ts.isIdentifier(property.name)) {
            throw new TypeScriptError('Only identifiers are allowed as property names in "toLocalizedCommand"', property);
        }
        const name = property.name.text;
        if (!relevantProps.includes(property.name.text)) {
            continue;
        }
        if (property.name.text === 'label') {
            labelNode = property.initializer;
        }

        try {
            const value = extractString(property.initializer);
            propertyMap.set(name, value);
        } catch (err) {
            const tsError = err as Error;
            errors?.push(tsError.message);
            if (!options?.quiet) {
                console.log(tsError.message);
            }
        }
    }

    let labelKey = propertyMap.get('id');
    let categoryKey: string | undefined = undefined;
    let categoryNode: ts.Node | undefined;

    // We have an explicit label translation key
    if (args.length > 1) {
        try {
            const labelOverrideKey = extractStringOrUndefined(args[1]);
            if (labelOverrideKey) {
                labelKey = labelOverrideKey;
                labelNode = args[1];
            }
        } catch (err) {
            const tsError = err as Error;
            errors?.push(tsError.message);
            if (!options?.quiet) {
                console.log(tsError.message);
            }
        }
    }

    // We have an explicit category translation key
    if (args.length > 2) {
        try {
            categoryKey = extractStringOrUndefined(args[2]);
            categoryNode = args[2];
        } catch (err) {
            const tsError = err as Error;
            errors?.push(tsError.message);
            if (!options?.quiet) {
                console.log(tsError.message);
            }
        }
    }

    if (!labelKey) {
        throw new TypeScriptError('No label key found', node);
    }

    if (!propertyMap.get('label')) {
        throw new TypeScriptError('No default label found', node);
    }

    let categoryLocalization: [string, string, ts.Node] | undefined = undefined;
    const categoryLabel = propertyMap.get('category');
    if (categoryKey && categoryLabel && categoryNode) {
        categoryLocalization = [categoryKey, categoryLabel, categoryNode];
    }

    return {
        label: [labelKey, propertyMap.get('label')!, labelNode],
        category: categoryLocalization
    };
}

function extractStringOrUndefined(node: ts.Expression): string | undefined {
    if (node.getText() === 'undefined') {
        return undefined;
    }
    return extractString(node);
}

function extractString(node: ts.Expression): string {
    if (ts.isIdentifier(node)) {
        const reference = followReference(node);
        if (!reference) {
            throw new TypeScriptError(`Could not resolve reference to '${node.text}'`, node);
        }
        node = reference;
    }
    if (ts.isTemplateLiteral(node)) {
        throw new TypeScriptError(
            "Template literals are not supported for localization. Please use the additional arguments of the 'nls.localize' function to format strings",
            node
        );
    }
    if (!ts.isStringLiteralLike(node)) {
        throw new TypeScriptError(`'${node.getText()}' is not a string constant`, node);
    }

    return unescapeString(node.text);
}

function followReference(node: ts.Identifier): ts.Expression | undefined {
    const scope = collectScope(node);
    const next = scope.get(node.text);
    if (next && ts.isIdentifier(next)) {
        return followReference(next);
    }
    return next;
}

function collectScope(node: ts.Node, map: Map<string, ts.Expression> = new Map()): Map<string, ts.Expression> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locals = (node as any)['locals'] as Map<string, ts.Symbol>;
    if (locals) {
        for (const [key, value] of locals.entries()) {
            if (!map.has(key)) {
                const declaration = value.valueDeclaration;
                if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
                    map.set(key, declaration.initializer);
                }
            }
        }
    }
    if (node.parent) {
        collectScope(node.parent, map);
    }
    return map;
}

function isCommandLocalizeUtility(node: ts.Node): boolean {
    if (!ts.isCallExpression(node)) {
        return false;
    }

    return node.expression.getText() === 'Command.toLocalizedCommand';
}

const unescapeMap: Record<string, string> = {
    '\'': '\'',
    '"': '"',
    '\\': '\\',
    'n': '\n',
    'r': '\r',
    't': '\t',
    'b': '\b',
    'f': '\f'
};

function unescapeString(str: string): string {
    const result: string[] = [];
    for (let i = 0; i < str.length; i++) {
        const ch = str.charAt(i);
        if (ch === '\\') {
            if (i + 1 < str.length) {
                const replace = unescapeMap[str.charAt(i + 1)];
                if (replace !== undefined) {
                    result.push(replace);
                    i++;
                    continue;
                }
            }
        }
        result.push(ch);
    }
    return result.join('');
}
