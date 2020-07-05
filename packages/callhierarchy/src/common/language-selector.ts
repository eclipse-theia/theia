/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
import { match as matchGlobPattern } from './glob';

export interface RelativePattern {
    base: string;
    pattern: string;
    pathToRelative(from: string, to: string): string;
}

export interface LanguageFilter {
    language?: string;
    scheme?: string;
    pattern?: string | RelativePattern;
    hasAccessToAllModels?: boolean;
}
export type LanguageSelector = string | LanguageFilter | (string | LanguageFilter)[];

export function score(selector: LanguageSelector | undefined, uriScheme: string, path: string, candidateLanguage: string, candidateIsSynchronized: boolean): number {

    if (Array.isArray(selector)) {
        let ret = 0;
        for (const filter of selector) {
            const value = score(filter, uriScheme, path, candidateLanguage, candidateIsSynchronized);
            if (value === 10) {
                return value;
            }
            if (value > ret) {
                ret = value;
            }
        }
        return ret;

    } else if (typeof selector === 'string') {

        if (!candidateIsSynchronized) {
            return 0;
        }

        if (selector === '*') {
            return 5;
        } else if (selector === candidateLanguage) {
            return 10;
        } else {
            return 0;
        }

    } else if (selector) {
        const { language, pattern, scheme, hasAccessToAllModels } = selector;

        if (!candidateIsSynchronized && !hasAccessToAllModels) {
            return 0;
        }

        let result = 0;

        if (scheme) {
            if (scheme === uriScheme) {
                result = 10;
            } else if (scheme === '*') {
                result = 5;
            } else {
                return 0;
            }
        }

        if (language) {
            if (language === candidateLanguage) {
                result = 10;
            } else if (language === '*') {
                result = Math.max(result, 5);
            } else {
                return 0;
            }
        }

        if (pattern) {
            if (pattern === path || matchGlobPattern(pattern, path)) {
                result = 10;
            } else {
                return 0;
            }
        }

        return result;

    } else {
        return 0;
    }
}
