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

import { interfaces } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, isBasicWasmSupported } from '@theia/core/lib/browser';
import { bindContributionProvider } from '@theia/core';
import { TextmateRegistry } from './textmate-registry';
import { LanguageGrammarDefinitionContribution } from './textmate-contribution';
import { MonacoTextmateService, OnigasmPromise } from './monaco-textmate-service';
import { MonacoThemeRegistry } from './monaco-theme-registry';
import { loadWASM, OnigScanner, OnigString } from 'onigasm';
import { IOnigLib } from 'vscode-textmate';

export function fetchOnigasm(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const onigasmPath = require('onigasm/lib/onigasm.wasm'); // webpack doing its magic here
        const request = new XMLHttpRequest();

        request.onreadystatechange = function (): void {
            if (this.readyState === XMLHttpRequest.DONE) {
                if (this.status === 200) {
                    resolve(this.response);
                } else {
                    reject(new Error('Could not fetch onigasm'));
                }
            }
        };

        request.open('GET', onigasmPath, true);
        request.responseType = 'arraybuffer';
        request.send();
    });
}

export class OnigasmLib implements IOnigLib {
    createOnigScanner(sources: string[]): OnigScanner {
        return new OnigScanner(sources);
    }
    createOnigString(sources: string): OnigString {
        return new OnigString(sources);
    }
}

export default (bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind) => {
    const onigasmPromise: Promise<IOnigLib> = isBasicWasmSupported ? fetchOnigasm().then(async buffer => {
        await loadWASM(buffer);
        return new OnigasmLib();
    }) : Promise.reject(new Error('wasm not supported'));
    bind(OnigasmPromise).toConstantValue(onigasmPromise);

    bind(MonacoTextmateService).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MonacoTextmateService);
    bindContributionProvider(bind, LanguageGrammarDefinitionContribution);
    bind(TextmateRegistry).toSelf().inSingletonScope();
    bind(MonacoThemeRegistry).toDynamicValue(() => MonacoThemeRegistry.SINGLETON).inSingletonScope();
};
