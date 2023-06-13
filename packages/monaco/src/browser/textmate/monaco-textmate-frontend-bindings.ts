// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import { interfaces } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, isBasicWasmSupported } from '@theia/core/lib/browser';
import { bindContributionProvider } from '@theia/core';
import { TextmateRegistry } from './textmate-registry';
import { LanguageGrammarDefinitionContribution } from './textmate-contribution';
import { MonacoTextmateService } from './monaco-textmate-service';
import { MonacoThemeRegistry } from './monaco-theme-registry';
import { loadWASM, createOnigScanner, OnigScanner, createOnigString, OnigString } from 'vscode-oniguruma';
import { IOnigLib, IRawGrammar, parseRawGrammar, Registry } from 'vscode-textmate';
import { OnigasmProvider, TextmateRegistryFactory, ThemeMix } from './monaco-theme-types';

export class OnigasmLib implements IOnigLib {
    createOnigScanner(sources: string[]): OnigScanner {
        return createOnigScanner(sources);
    }
    createOnigString(sources: string): OnigString {
        return createOnigString(sources);
    }
}

export default (bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind) => {
    const onigLib = createOnigasmLib();
    bind(OnigasmProvider).toConstantValue(() => onigLib);
    bind(MonacoTextmateService).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MonacoTextmateService);
    bindContributionProvider(bind, LanguageGrammarDefinitionContribution);
    bind(TextmateRegistry).toSelf().inSingletonScope();
    bind(MonacoThemeRegistry).toSelf().inSingletonScope();
    bind(TextmateRegistryFactory).toFactory(({ container }) => (theme?: ThemeMix) => {
        const onigProvider = container.get<OnigasmProvider>(OnigasmProvider);
        const textmateRegistry = container.get(TextmateRegistry);
        return new Registry({
            onigLib: onigProvider(),
            theme,
            loadGrammar: async (scopeName: string) => {
                const provider = textmateRegistry.getProvider(scopeName);
                if (provider) {
                    const definition = await provider.getGrammarDefinition();
                    let rawGrammar: IRawGrammar;
                    if (typeof definition.content === 'string') {
                        rawGrammar = parseRawGrammar(definition.content, definition.format === 'json' ? 'grammar.json' : 'grammar.plist');
                    } else {
                        rawGrammar = definition.content as IRawGrammar;
                    }
                    return rawGrammar;
                }
                return undefined;
            },
            getInjections: (scopeName: string) => {
                const provider = textmateRegistry.getProvider(scopeName);
                if (provider && provider.getInjections) {
                    return provider.getInjections(scopeName);
                }
                return [];
            }
        });
    });
};

export async function createOnigasmLib(): Promise<IOnigLib> {
    if (!isBasicWasmSupported) {
        throw new Error('wasm not supported');
    }
    const wasm = await fetchOnigasm();
    await loadWASM(wasm);
    return new OnigasmLib();
}

export async function fetchOnigasm(): Promise<ArrayBuffer> {
    // Using Webpack's wasm loader should give us a URL to fetch the resource from:
    const onigasmPath: string = require('vscode-oniguruma/release/onig.wasm');
    const response = await fetch(onigasmPath, { method: 'GET' });
    return response.arrayBuffer();
}
