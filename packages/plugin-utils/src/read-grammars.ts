// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

import * as path from 'path';
import * as fs from 'fs-extra';
import { isObject } from './local-utils';
import type { PluginPackageGrammarsContribution, ScopeMap } from './contribution-types';

/** Normalized grammar contribution with inlined grammar file content. */
export interface GrammarsContribution {
    language?: string;
    scope: string;
    format: 'json' | 'plist';
    grammar: string | object;
    grammarLocation: string;
    injectTo?: string[];
    embeddedLanguages?: ScopeMap;
    tokenTypes?: ScopeMap;
}

/** Mirrors VS Code `validateGrammarExtensionPoint` manifest checks (without language registry lookup). */
export function isValidGrammarContribution(rawGrammar: PluginPackageGrammarsContribution, pluginPath: string): boolean {
    if (typeof rawGrammar.scopeName !== 'string' || rawGrammar.scopeName.length === 0) {
        return false;
    }
    if (typeof rawGrammar.path !== 'string' || rawGrammar.path.length === 0) {
        return false;
    }
    if (rawGrammar.language !== undefined && typeof rawGrammar.language !== 'string') {
        return false;
    }
    if (rawGrammar.injectTo !== undefined
        && (!Array.isArray(rawGrammar.injectTo) || rawGrammar.injectTo.some(scope => typeof scope !== 'string'))) {
        return false;
    }
    if (rawGrammar.embeddedLanguages !== undefined && !isObject(rawGrammar.embeddedLanguages)) {
        return false;
    }
    if (rawGrammar.tokenTypes !== undefined && !isObject(rawGrammar.tokenTypes)) {
        return false;
    }
    const resolvedPluginPath = path.resolve(pluginPath);
    const grammarPath = path.resolve(resolvedPluginPath, rawGrammar.path);
    const relativePath = path.relative(resolvedPluginPath, grammarPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return false;
    }
    return true;
}

export async function readGrammarFromDisk(
    rawGrammar: PluginPackageGrammarsContribution,
    pluginPath: string
): Promise<GrammarsContribution | undefined> {
    if (!isValidGrammarContribution(rawGrammar, pluginPath)) {
        return undefined;
    }

    let grammar: string | object;
    const grammarPath = path.resolve(pluginPath, rawGrammar.path);

    if (rawGrammar.path.endsWith('json')) {
        grammar = await fs.readJson(grammarPath);
    } else {
        grammar = await fs.readFile(grammarPath, 'utf8');
    }

    return {
        language: rawGrammar.language,
        scope: rawGrammar.scopeName,
        format: rawGrammar.path.endsWith('json') ? 'json' : 'plist',
        grammar,
        grammarLocation: rawGrammar.path,
        injectTo: rawGrammar.injectTo,
        embeddedLanguages: rawGrammar.embeddedLanguages,
        tokenTypes: rawGrammar.tokenTypes
    };
}
