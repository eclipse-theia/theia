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
import { MessageConnection } from 'vscode-jsonrpc';
import {
    BaseLanguageClientContribution, LanguageClientFactory,
    LanguageClientOptions,
    ILanguageClient
} from '@theia/languages/lib/browser';
import { Languages, Workspace } from '@theia/languages/lib/browser';
import { SemanticHighlightingService } from '@theia/editor/lib/browser/semantic-highlight/semantic-highlighting-service';
import { ILogger } from '@theia/core/lib/common/logger';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { CPP_LANGUAGE_ID, CPP_LANGUAGE_NAME, HEADER_AND_SOURCE_FILE_EXTENSIONS, CppStartParameters } from '../common';
import { CppBuildConfigurationManager } from './cpp-build-configurations';
import { CppBuildConfigurationsStatusBarElement } from './cpp-build-configurations-statusbar-element';
import { CppBuildConfiguration } from '../common/cpp-build-configuration-protocol';
import { CppPreferences } from './cpp-preferences';
import URI from '@theia/core/lib/common/uri';

/**
 * Clangd extension to set clangd-specific "initializationOptions" in the
 * "initialize" request and for the "workspace/didChangeConfiguration"
 * notification since the data received is described as 'any' type in LSP.
 */
interface ClangdConfigurationParamsChange {
    compilationDatabasePath?: string;

    /**
     * Experimental field.
     */
    compilationDatabaseMap?: Array<{
        sourceDir: string;
        dbPath: string;
    }>;
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

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(LanguageClientFactory) protected readonly languageClientFactory: LanguageClientFactory,
        @inject(SemanticHighlightingService) protected readonly semanticHighlightingService: SemanticHighlightingService,
    ) {
        super(workspace, languages, languageClientFactory);
    }

    @postConstruct()
    protected init(): void {
        this.cppBuildConfigurations.onActiveConfigChange2(() => this.onActiveBuildConfigChanged());
        this.cppPreferences.onPreferenceChanged(() => this.restart());
    }

    protected onReady(languageClient: ILanguageClient): void {
        super.onReady(languageClient);

        // Display the C/C++ build configurations status bar element to select active build config
        this.cppBuildConfigurationsStatusBarElement.show();
    }

    protected async createCompilationDatabaseMap(mergeCompilationDatabases: boolean): Promise<Map<string, string>> {
        const activeConfigurations = new Map<string, CppBuildConfiguration>();
        const databaseMap = new Map<string, string>();

        for (const [source, config] of this.cppBuildConfigurations.getAllActiveConfigs!().entries()) {
            if (config) {
                activeConfigurations.set(source, config);
                databaseMap.set(source, config.directory);
            }
        }

        if (activeConfigurations.size > 1 && mergeCompilationDatabases) {
            databaseMap.clear(); // Use only one configuration.
            const configs = [...activeConfigurations.values()];
            try {
                const mergedDatabaseUri = new URI(await this.cppBuildConfigurations.getMergedCompilationDatabase!({
                    directories: configs.map(config => config.directory),
                }));
                databaseMap.set('undefined', mergedDatabaseUri.parent.path.toString());
            } catch (error) {
                this.logger.error(error);
                databaseMap.set('undefined', configs[0].directory);
            }
        }

        return databaseMap;
    }

    protected createLanguageClient(connection: MessageConnection): ILanguageClient {
        const client: ILanguageClient & Readonly<{ languageId: string }> = Object.assign(super.createLanguageClient(connection), { languageId: this.id });
        client.registerFeature(SemanticHighlightingService.createNewFeature(this.semanticHighlightingService, client));
        return client;
    }

    private async updateInitializationOptions(): Promise<void> {
        const clangdParams: ClangdConfigurationParamsChange = {};
        const experimentalCompilationDatabaseMap = this.cppPreferences['cpp.experimentalCompilationDatabaseMap'];
        const databaseMap = await this.createCompilationDatabaseMap(!experimentalCompilationDatabaseMap);

        if (databaseMap.size === 1) {
            clangdParams.compilationDatabasePath = [...databaseMap.values()][0];
        } else if (databaseMap.size > 1 && experimentalCompilationDatabaseMap) {
            clangdParams.compilationDatabaseMap = [...databaseMap.entries()].map(
                ([sourceDir, dbPath]) => ({ sourceDir: new URI(sourceDir).path.toString(), dbPath, }));
        }

        const lc = await this.languageClient;
        lc.clientOptions.initializationOptions = clangdParams;
    }

    protected onActiveBuildConfigChanged(): void {
        this.restart();
    }

    protected get documentSelector(): string[] {
        // This is used (at least) to determine which files, when they are open,
        // trigger the launch of the C/C++ language server.
        return HEADER_AND_SOURCE_FILE_EXTENSIONS;
    }

    protected get globPatterns(): string[] {
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
        clientOptions.initializationFailedHandler = () => {
            const READ_INSTRUCTIONS_ACTION = 'Read Instructions';
            const ERROR_MESSAGE = 'Error starting C/C++ language server. ' +
                "Please make sure 'clangd' is installed on your system. " +
                'You can refer to the clangd page for instructions.';
            this.messageService.error(ERROR_MESSAGE, READ_INSTRUCTIONS_ACTION).then(selected => {
                if (READ_INSTRUCTIONS_ACTION === selected) {
                    this.windowService.openNewWindow('https://clang.llvm.org/extra/clangd.html', { external: true });
                }
            });
            this.logger.error(ERROR_MESSAGE);
            return false;
        };
        return clientOptions;
    }

    protected async getStartParameters(): Promise<CppStartParameters> {

        // getStartParameters is one of the only async steps in the LC
        // initialization sequence, so we will update asynchronously the
        // options here
        await this.updateInitializationOptions();

        return {
            clangdExecutable: this.cppPreferences['cpp.clangdExecutable'],
            clangdArgs: this.cppPreferences['cpp.clangdArgs'],
            clangTidy: this.cppPreferences['cpp.clangTidy'],
            clangTidyChecks: this.cppPreferences['cpp.clangTidyChecks']
        };
    }
}
