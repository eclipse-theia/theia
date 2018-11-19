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

import { injectable, inject, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { PreferenceService, PreferenceScope } from '@theia/core/lib/browser/preferences';
import { BaseLanguageClientContribution, Workspace, Languages, LanguageClientFactory, ILanguageClient, State } from '@theia/languages/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { WorkspaceVariableContribution } from '@theia/workspace/lib/browser/workspace-variable-contribution';
import { TypeScriptInitializationOptions, TypeScriptInitializeResult } from 'typescript-language-server/lib/ts-protocol';
import {
    TYPESCRIPT_LANGUAGE_ID, TYPESCRIPT_LANGUAGE_NAME, TYPESCRIPT_REACT_LANGUAGE_ID, JAVASCRIPT_LANGUAGE_ID, JAVASCRIPT_REACT_LANGUAGE_ID, TypescriptStartParams
} from '../common';
import { TypescriptPreferences } from './typescript-preferences';
import { TypescriptVersion, TypescriptVersionService, TypescriptVersionOptions } from '../common/typescript-version-service';

@injectable()
export class TypeScriptClientContribution extends BaseLanguageClientContribution {

    readonly id = TYPESCRIPT_LANGUAGE_ID;
    readonly name = TYPESCRIPT_LANGUAGE_NAME;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(WorkspaceVariableContribution)
    protected readonly workspaceVariables: WorkspaceVariableContribution;

    @inject(TypescriptPreferences)
    protected readonly preferences: TypescriptPreferences;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(TypescriptVersionService)
    protected readonly versionService: TypescriptVersionService;

    protected readonly onDidChangeVersionEmitter = new Emitter<TypescriptVersion | undefined>();
    readonly onDidChangeVersion: Event<TypescriptVersion | undefined> = this.onDidChangeVersionEmitter.event;

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(LanguageClientFactory) protected readonly languageClientFactory: LanguageClientFactory
    ) {
        super(workspace, languages, languageClientFactory);
    }

    @postConstruct()
    protected init(): void {
        this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'typescript.server.log') {
                this.restart();
            }
        });
        this.onDidChangeVersion(() => this.restart());
    }

    protected _version: TypescriptVersion | undefined;
    get version(): TypescriptVersion | undefined {
        return this._version;
    }
    async setVersion(raw: TypescriptVersion | undefined): Promise<void> {
        const version = await this.validateVersion(raw);
        if (TypescriptVersion.equals(this._version, version)) {
            return;
        }
        this._version = version;
        if (version && version.qualifier === 'Workspace') {
            const tsdkPath = this.workspaceVariables.getWorkspaceRelativePath(new URI(version.uri));
            if (tsdkPath) {
                this.preferenceService.set('typescript.tsdk', tsdkPath, PreferenceScope.Workspace);
            }
        }
        this.onDidChangeVersionEmitter.fire(this._version);
    }

    protected async getStartParameters(): Promise<TypescriptStartParams> {
        await this.restored.promise;
        const { version } = this;
        await this.setVersion(version);
        return { version };
    }

    protected get documentSelector(): string[] {
        return [
            TYPESCRIPT_LANGUAGE_ID,
            TYPESCRIPT_REACT_LANGUAGE_ID,
            JAVASCRIPT_LANGUAGE_ID,
            JAVASCRIPT_REACT_LANGUAGE_ID
        ];
    }

    protected get workspaceContains() {
        // FIXME requires https://github.com/theia-ide/theia/issues/2359
        // return [
        //     "**/tsconfig.json",
        //     "**/jsconfig.json",
        //     "**/tsconfig.*.json",
        //     "**/jsconfig.*.json"
        // ];
        return [
            'tsconfig.json',
            'jsconfig.json'
        ];
    }

    protected get initializationOptions(): Partial<TypeScriptInitializationOptions> {
        const options: Partial<TypeScriptInitializationOptions> = {};
        const logVerbosity = this.preferences['typescript.server.log'];
        if (logVerbosity !== 'off') {
            options.logVerbosity = logVerbosity;
        }
        return options;
    }

    protected _logFileUri: URI | undefined;
    get logFileUri(): URI | undefined {
        return this._logFileUri;
    }
    protected onReady(languageClient: ILanguageClient): void {
        if (languageClient.initializeResult) {
            const initializeResult = languageClient.initializeResult as TypeScriptInitializeResult;
            this._logFileUri = initializeResult.logFileUri !== undefined ? new URI(initializeResult.logFileUri) : undefined;
        }
        languageClient.onDidChangeState(({ newState }) => {
            if (newState === State.Stopped) {
                this._logFileUri = undefined;
            }
        });
        super.onReady(languageClient);
    }

    protected async validateVersion(candidate: TypescriptVersion | undefined): Promise<TypescriptVersion | undefined> {
        const versions = await this.getVersions();
        if (candidate && versions.some(version => TypescriptVersion.equals(candidate, version))) {
            return candidate;
        }
        return versions[0];
    }
    getVersions(): Promise<TypescriptVersion[]> {
        return this.versionService.getVersions(this.versionOptions);
    }
    protected get versionOptions(): TypescriptVersionOptions {
        return {
            workspaceFolders: this.workspaceService.tryGetRoots().map(({ uri }) => uri),
            localTsdk: this.preferences['typescript.tsdk']
        };
    }

    store(): TypescriptContributionData {
        return {
            version: this._version
        };
    }

    protected readonly restored = new Deferred();
    async restore(data: TypescriptContributionData | undefined): Promise<void> {
        try {
            if (!this._version) {
                await this.setVersion(data && data.version);
            }
        } finally {
            this.restored.resolve();
        }
    }

}
export interface TypescriptContributionData {
    version?: TypescriptVersion
}
