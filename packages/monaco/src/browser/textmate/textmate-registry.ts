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
import { RegistryOptions, IGrammarConfiguration } from "monaco-textmate";

@injectable()
export class TextmateRegistry {
    readonly scopeToProvider = new Map<string, RegistryOptions>();
    readonly languageToConfig = new Map<string, IGrammarConfiguration>();
    readonly languageIdToScope = new Map<string, string>();

    registerTextMateGrammarScope(scope: string, provider: RegistryOptions): void {
        if (this.scopeToProvider.has(scope)) {
            console.warn(new Error(`a registered grammar provider for '${scope}' scope is overriden`));
        }
        this.scopeToProvider.set(scope, provider);
    }

    getProvider(scope: string): RegistryOptions | undefined {
        return this.scopeToProvider.get(scope);
    }

    mapLanguageIdToTextmateGrammar(languageId: string, scope: string): void {
        const existingScope = this.getScope(languageId);
        if (typeof existingScope === "string") {
            console.warn(new Error(`'${languageId}' language is remapped from '${existingScope}' to '${scope}' scope`));
        }
        this.languageIdToScope.set(languageId, scope);
    }

    getScope(languageId: string): string | undefined {
        return this.languageIdToScope.get(languageId);
    }

    registerGrammarConfiguration(languageId: string, config: IGrammarConfiguration): void {
        if (this.languageToConfig.has(languageId)) {
            console.warn(new Error(`a registered grammar configuration for '${languageId}' language is overriden`));
        }
        this.languageToConfig.set(languageId, config);
    }

    getGrammarConfiguration(languageId: string): IGrammarConfiguration {
        return this.languageToConfig.get(languageId) || {};
    }
}
