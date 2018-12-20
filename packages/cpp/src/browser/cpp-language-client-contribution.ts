/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import {
    BaseLanguageClientContribution, LanguageClientFactory,
    LanguageClientOptions,
    ILanguageClient
} from '@theia/languages/lib/browser';
import { Languages, Workspace } from '@theia/languages/lib/browser';
import { ILogger } from '@theia/core/lib/common/logger';
import { CPP_LANGUAGE_ID, CPP_LANGUAGE_NAME, HEADER_AND_SOURCE_FILE_EXTENSIONS, CppStartParameters } from '../common';
import { CppBuildConfigurationManager, CppBuildConfiguration } from './cpp-build-configurations';
import { CppBuildConfigurationsStatusBarElement } from './cpp-build-configurations-statusbar-element';
import { CppPreferences } from './cpp-preferences';

/**
 * Clangd extension to set clangd-specific "initializationOptions" in the
 * "initialize" request and for the "workspace/didChangeConfiguration"
 * notification since the data received is described as 'any' type in LSP.
 */
interface ClangdConfigurationParamsChange {
    compilationDatabasePath?: string;
}

@injectable()
export class CppLanguageClientContribution extends BaseLanguageClientContribution {

    readonly id = CPP_LANGUAGE_ID;
    readonly name = CPP_LANGUAGE_NAME;

    @inject(CppPreferences)
    protected readonly cppPreferences: CppPreferences;

    @inject(CppBuildConfigurationManager)
    protected readonly cppBuildConfigurations: CppBuildConfigurationManager;

    @inject(CppBuildConfigurationsStatusBarElement)
    protected readonly cppBuildConfigurationsStatusBarElement: CppBuildConfigurationsStatusBarElement;

    @inject(ILogger)
    protected readonly logger: ILogger;

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(LanguageClientFactory) protected readonly languageClientFactory: LanguageClientFactory,
    ) {
        super(workspace, languages, languageClientFactory);
    }

    @postConstruct()
    protected init() {
        this.cppBuildConfigurations.onActiveConfigChange(config => this.onActiveBuildConfigChanged(config));
    }

    protected onReady(languageClient: ILanguageClient): void {
        super.onReady(languageClient);

        // Display the C/C++ build configurations status bar element to select active build config
        this.cppBuildConfigurationsStatusBarElement.show();
    }

    private createClangdConfigurationParams(config: CppBuildConfiguration | undefined): ClangdConfigurationParamsChange {
        const clangdParams: ClangdConfigurationParamsChange = {};

        if (config) {
            clangdParams.compilationDatabasePath = config.directory;
        }

        return clangdParams;
    }

    async onActiveBuildConfigChanged(config: CppBuildConfiguration | undefined) {
        // Restart clangd.  The new config will be picked up when
        // createOptions will be called to send the initialize request
        // to the new instance of clangd.
        if (this.running) {
            this.restart();
        }
    }

    protected get documentSelector() {
        // This is used (at least) to determine which files, when they are open,
        // trigger the launch of the C/C++ language server.
        return HEADER_AND_SOURCE_FILE_EXTENSIONS;
    }

    protected get globPatterns() {
        // This is used (at least) to determine which files we watch.  Change
        // notifications are forwarded to the language server.
        return [
            '**/*.{' + HEADER_AND_SOURCE_FILE_EXTENSIONS.join() + '}',
            '**/compile_commands.json',
        ];
    }

    protected get configurationSection(): string[] {
        return [this.id];
    }

    protected createOptions(): LanguageClientOptions {
        const clientOptions = super.createOptions();
        clientOptions.initializationOptions = this.createClangdConfigurationParams(this.cppBuildConfigurations.getActiveConfig());

        clientOptions.initializationFailedHandler = () => {
            const READ_INSTRUCTIONS_ACTION = 'Read Instructions';
            const ERROR_MESSAGE = 'Error starting C/C++ language server. ' +
                "Please make sure 'clangd' is installed on your system. " +
                'You can refer to the clangd page for instructions.';
            this.messageService.error(ERROR_MESSAGE, READ_INSTRUCTIONS_ACTION).then(selected => {
                if (READ_INSTRUCTIONS_ACTION === selected) {
                    window.open('https://clang.llvm.org/extra/clangd.html');
                }
            });
            this.logger.error(ERROR_MESSAGE);
            return false;
        };
        return clientOptions;
    }

    protected getStartParameters(): CppStartParameters {
        return {
            clangdExecutable: this.cppPreferences['cpp.clangdExecutable'],
            clangdArgs: this.cppPreferences['cpp.clangdArgs']
        };
    }
}
