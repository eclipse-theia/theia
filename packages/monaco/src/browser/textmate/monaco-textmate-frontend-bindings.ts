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

import { interfaces } from 'inversify';
import { FrontendApplicationContribution, isBasicWasmSupported } from '@theia/core/lib/browser';
import { bindContributionProvider } from '@theia/core';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { BuiltinTextmateThemeProvider } from './monaco-textmate-builtin-theme-provider';
import { BuiltinMonacoThemeProvider } from './monaco-builtin-theme-provider';
import { TextmateRegistry, TextmateRegistryImpl } from './textmate-registry';
import { LanguageGrammarDefinitionContribution } from './textmate-contribution';
import { MonacoTextmateService, OnigasmPromise } from './monaco-textmate-service';
import { loadWASM } from 'onigasm';

export default (bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind) => {
    const onigasmPromise = isBasicWasmSupported ? loadWASM(require('onigasm/lib/onigasm.wasm')) : Promise.reject(new Error('wasm not supported'));
    bind(OnigasmPromise).toConstantValue(onigasmPromise);

    bind(MonacoTextmateService).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MonacoTextmateService);
    bindContributionProvider(bind, LanguageGrammarDefinitionContribution);
    bind(TextmateRegistry).to(TextmateRegistryImpl).inSingletonScope();

    const themeService = ThemeService.get();
    BuiltinMonacoThemeProvider.compileMonacoThemes();
    themeService.register(...BuiltinTextmateThemeProvider.theiaTextmateThemes);
};
