/**
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { LanguageGrammarDefinitionContribution, TextmateRegistry } from '@theia/monaco/lib/browser/textmate';

export interface BuiltinGrammar {
    format: 'json' | 'plist';
    language: string;
    scope: string;
    grammar?: object | string;
}

@injectable()
export class MonacoTextmateBuiltinGrammarContribution implements LanguageGrammarDefinitionContribution {

    protected readonly builtins: BuiltinGrammar[] = [
        {
            format: 'json',
            language: 'typescript',
            scope: 'source.ts',
            grammar: require('../../data/grammars/typescript.tmlanguage.json'),
        },
        {
            format: 'json',
            language: 'javascript',
            scope: 'source.js',
            grammar: require('../../data/grammars/javascript.tmlanguage.json'),
        }
    ];

    registerTextmateLanguage(registry: TextmateRegistry) {
        for (const grammar of this.builtins) {
            registry.registerTextMateGrammarScope(grammar.scope, {
                async getGrammarDefinition() {
                    return {
                        format: grammar.format,
                        content: grammar.grammar || '',
                    };
                }
            });

            registry.mapLanguageIdToTextmateGrammar(grammar.language, grammar.scope);
        }
    }
}
