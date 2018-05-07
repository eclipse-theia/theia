/**
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from 'inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { bindContributionProvider } from '@theia/core';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { BuiltinTextmateThemeProvider } from './monaco-textmate-builtin-theme-provider';
import { BuiltinMonacoThemeProvider } from './monaco-builtin-theme-provider';
import { TextmateRegistry, TextmateRegistryImpl } from './textmate-registry';
import { LanguageGrammarDefinitionContribution } from './textmate-contribution';
import { MonacoTextmateService, OnigasmPromise } from './monaco-textmate-service';
import { loadWASM } from 'onigasm';

export default (bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind) => {
    const onigasmPromise = loadWASM(require('onigasm/lib/onigasm.wasm'));
    bind(OnigasmPromise).toConstantValue(onigasmPromise);

    bind(MonacoTextmateService).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MonacoTextmateService);
    bindContributionProvider(bind, LanguageGrammarDefinitionContribution);
    bind(TextmateRegistry).to(TextmateRegistryImpl).inSingletonScope();

    const themeService = ThemeService.get();
    BuiltinMonacoThemeProvider.compileMonacoThemes();
    themeService.register(...BuiltinTextmateThemeProvider.theiaTextmateThemes);
};
