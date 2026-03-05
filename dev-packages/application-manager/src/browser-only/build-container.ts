// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

import * as os from 'os';
import { Container, ContainerModule } from '@theia/core/shared/inversify';
import { PluginScanner } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { TheiaPluginScanner } from '@theia/plugin-ext/lib/hosted/node/scanners/scanner-theia';
import { VsCodePluginScanner } from '@theia/plugin-ext-vscode/lib/node/scanner-vscode';
import { PluginUriFactory } from '@theia/plugin-ext/lib/hosted/node/scanners/plugin-uri-factory';
import { FilePluginUriFactory } from '@theia/plugin-ext/lib/hosted/node/scanners/file-plugin-uri-factory';
import { GrammarsReader } from '@theia/plugin-ext/lib/hosted/node/scanners/grammars-reader';
import { HostedPluginLocalizationService } from '@theia/plugin-ext/lib/hosted/node/hosted-plugin-localization-service';
import { LanguagePackService } from '@theia/plugin-ext/lib/common/language-pack-service';
import { LocalizationProvider } from '@theia/core/lib/node/i18n/localization-provider';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { PrepareBrowserOnlyPluginsRunner, PluginScannerResolverImpl, PluginScannerResolverSymbol } from './prepare-plugins-runner';

export { PluginScannerResolverSymbol, PluginScannerResolver } from './prepare-plugins-runner';

const tmpUri = 'file://' + os.tmpdir();

/** Build-time LocalizationProvider: fixed locale 'en', no language packs. */
class BuildLocalizationProvider extends LocalizationProvider {
    constructor() {
        super();
        this.setCurrentLanguage('en');
    }
}

const noOpLanguagePackService: LanguagePackService = {
    storeBundle: () => { },
    deleteBundle: () => { },
    getBundle: async () => undefined
};

const buildEnvVariablesServer: EnvVariablesServer = {
    getConfigDirUri: async () => tmpUri,
    getExecPath: async () => '',
    getVariables: async () => [],
    getValue: async () => undefined,
    getHomeDirUri: async () => tmpUri,
    getDrives: async () => []
};

/**
 * Creates the common build container with scanner, localization service (build-time mocks),
 * and PrepareBrowserOnlyPluginsRunner. Use this so prepare-plugins (and any other build script)
 * runs inside the container and gets deps via DI.
 */
export function createBuildContainer(): Container {
    const container = new Container();

    const buildModule = new ContainerModule(bind => {
        // Plugin Scanner
        bind(GrammarsReader).toSelf().inSingletonScope();
        bind(PluginUriFactory).to(FilePluginUriFactory).inSingletonScope();
        bind(PluginScanner).to(TheiaPluginScanner).inSingletonScope();
        bind(PluginScanner).to(VsCodePluginScanner).inSingletonScope();
        bind(PluginScannerResolverSymbol).to(PluginScannerResolverImpl).inSingletonScope();

        // Localization (simple mocks for build time)
        bind(LocalizationProvider).to(BuildLocalizationProvider).inSingletonScope();
        bind(LanguagePackService).toConstantValue(noOpLanguagePackService);
        bind(EnvVariablesServer).toConstantValue(buildEnvVariablesServer);
        bind(HostedPluginLocalizationService).toSelf().inSingletonScope();

        bind(PrepareBrowserOnlyPluginsRunner).toSelf().inSingletonScope();
    });

    container.load(buildModule);
    return container;
}
