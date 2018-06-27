/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { injectable } from "inversify";
import { RegistryOptions } from "monaco-textmate";

export const TextmateRegistry = Symbol('TextmateRegistry');
export interface TextmateRegistry {
    registerTextMateGrammarScope(scopeName: string, provider: RegistryOptions): void;
    mapLanguageIdToTextmateGrammar(language: string, scopeName: string): void;

    hasProvider(scopeName: string): boolean;
    getProvider(scopeName: string): RegistryOptions | undefined;

    hasScope(languageId: string): boolean;
    getScope(languageId: string): string | undefined;
}

@injectable()
export class TextmateRegistryImpl implements TextmateRegistry {
    public readonly scopeToProvider = new Map<string, RegistryOptions>();
    public readonly languageIdToScope = new Map<string, string>();

    registerTextMateGrammarScope(scopeName: string, provider: RegistryOptions): void {
        this.scopeToProvider.set(scopeName, provider);
    }

    mapLanguageIdToTextmateGrammar(language: string, scopeName: string): void {
        this.languageIdToScope.set(language, scopeName);
    }

    hasProvider(scopeName: string): boolean {
        return this.scopeToProvider.has(scopeName);
    }

    getProvider(scopeName: string): RegistryOptions | undefined {
        return this.scopeToProvider.get(scopeName);
    }

    hasScope(languageId: string): boolean {
        return this.languageIdToScope.has(languageId);
    }

    getScope(languageId: string): string | undefined {
        return this.languageIdToScope.get(languageId);
    }
}
