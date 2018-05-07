/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
