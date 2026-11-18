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
import { bindRootContributionProvider } from '@theia/core';
import { TextmateRegistry } from './textmate-registry.js';
import { LanguageGrammarDefinitionContribution } from './textmate-contribution.js';
import { MonacoTextmateService } from './monaco-textmate-service.js';
import { MonacoThemeRegistry } from './monaco-theme-registry.js';
// CommonJS modules whose exports cannot be detected statically, so they are imported as a whole.
import vscodeOniguruma, { type OnigScanner, type OnigString } from 'vscode-oniguruma';
import vscodeTextmate, { type IOnigLib, type IRawGrammar } from 'vscode-textmate';
import { OnigasmProvider, TextmateRegistryFactory, ThemeMix } from './monaco-theme-types.js';

export class OnigasmLib implements IOnigLib {
    createOnigScanner(sources: string[]): OnigScanner {
        return vscodeOniguruma.createOnigScanner(sources);
    }
    createOnigString(sources: string): OnigString {
        return vscodeOniguruma.createOnigString(sources);
    }
}

export default (bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind) => {
    const onigLib = createOnigasmLib();
    bind(OnigasmProvider).toConstantValue(() => onigLib);
    bind(MonacoTextmateService).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MonacoTextmateService);
    bindRootContributionProvider(bind, LanguageGrammarDefinitionContribution);
    bind(TextmateRegistry).toSelf().inSingletonScope();
    bind(MonacoThemeRegistry).toSelf().inSingletonScope();
    bind(TextmateRegistryFactory).toFactory(({ container }) => (theme?: ThemeMix) => {
        const onigProvider = container.get<OnigasmProvider>(OnigasmProvider);
        const textmateRegistry = container.get(TextmateRegistry);
        return new vscodeTextmate.Registry({
            onigLib: onigProvider(),
            theme,
            loadGrammar: async (scopeName: string) => {
                const provider = textmateRegistry.getProvider(scopeName);
                if (provider) {
                    const definition = await provider.getGrammarDefinition();
                    let rawGrammar: IRawGrammar;
                    if (typeof definition.content === 'string') {
                        rawGrammar = vscodeTextmate.parseRawGrammar(definition.content, definition.format === 'json' ? 'grammar.json' : 'grammar.plist');
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
    await vscodeOniguruma.loadWASM(wasm);
    return new OnigasmLib();
}

export async function fetchOnigasm(): Promise<ArrayBuffer> {
    // The bundler's loader for `.wasm` files gives us a URL to fetch the resource from.
    // It is imported when needed, as Node would load it as a WebAssembly module.
    const { default: onigasmUrl } = await import('vscode-oniguruma/release/onig.wasm');
    const response = await fetch(onigasmUrl, { method: 'GET' });
    return response.arrayBuffer();
}
