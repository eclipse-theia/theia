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
import { isObject } from '../utils';
import type {
    GrammarsContribution,
    NormalizeContributionsContext,
    PluginPackageGrammarsContribution,
} from '../contribution-types';

export type { GrammarsContribution } from '../contribution-types';

/**
 * Returns a validation error message, or `undefined` if the contribution is valid.
 * Mirrors VS Code `validateGrammarExtensionPoint` manifest checks (without language registry lookup),
 * plus a path-containment guard against escaping the plugin directory.
 */
export function getGrammarContributionValidationError(
    rawGrammar: PluginPackageGrammarsContribution,
    pluginPath: string
): string | undefined {
    if (typeof rawGrammar.scopeName !== 'string' || rawGrammar.scopeName.length === 0) {
        return `Invalid grammar contribution: 'scopeName' must be a non-empty string (path: ${String(rawGrammar.path)}).`;
    }
    if (typeof rawGrammar.path !== 'string' || rawGrammar.path.length === 0) {
        return `Invalid grammar contribution '${rawGrammar.scopeName}': 'path' must be a non-empty string.`;
    }
    if (rawGrammar.language !== undefined && typeof rawGrammar.language !== 'string') {
        return `Invalid grammar contribution '${rawGrammar.scopeName}': 'language' must be a string when set.`;
    }
    if (rawGrammar.injectTo !== undefined
        && (!Array.isArray(rawGrammar.injectTo) || rawGrammar.injectTo.some(scope => typeof scope !== 'string'))) {
        return `Invalid grammar contribution '${rawGrammar.scopeName}': 'injectTo' must be a string array when set.`;
    }
    if (rawGrammar.embeddedLanguages !== undefined && !isObject(rawGrammar.embeddedLanguages)) {
        return `Invalid grammar contribution '${rawGrammar.scopeName}': 'embeddedLanguages' must be an object when set.`;
    }
    if (rawGrammar.tokenTypes !== undefined && !isObject(rawGrammar.tokenTypes)) {
        return `Invalid grammar contribution '${rawGrammar.scopeName}': 'tokenTypes' must be an object when set.`;
    }
    const resolvedPluginPath = path.resolve(pluginPath);
    const grammarPath = path.resolve(resolvedPluginPath, rawGrammar.path);
    const relativePath = path.relative(resolvedPluginPath, grammarPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return `Invalid grammar contribution '${rawGrammar.scopeName}': path '${rawGrammar.path}' escapes the plugin directory.`;
    }
    return undefined;
}

export async function readGrammarFromDisk(
    rawGrammar: PluginPackageGrammarsContribution,
    pluginPath: string,
    log?: Pick<NormalizeContributionsContext, 'onError'>
): Promise<GrammarsContribution | undefined> {
    const validationError = getGrammarContributionValidationError(rawGrammar, pluginPath);
    if (validationError) {
        log?.onError('grammars', validationError);
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
        tokenTypes: rawGrammar.tokenTypes,
        balancedBracketScopes: rawGrammar.balancedBracketScopes,
        unbalancedBracketScopes: rawGrammar.unbalancedBracketScopes
    };
}
