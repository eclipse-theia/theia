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
import { BaseLanguageClientContribution, Workspace, Languages, LanguageClientFactory, ILanguageClient, State } from '@theia/languages/lib/browser';
import { TypeScriptInitializationOptions, TypeScriptInitializeResult } from 'typescript-language-server/lib/ts-protocol';
import { TYPESCRIPT_LANGUAGE_ID, TYPESCRIPT_LANGUAGE_NAME, TYPESCRIPT_REACT_LANGUAGE_ID, JAVASCRIPT_LANGUAGE_ID, JAVASCRIPT_REACT_LANGUAGE_ID } from '../common';
import { TypescriptPreferences } from './typescript-preferences';

@injectable()
export class TypeScriptClientContribution extends BaseLanguageClientContribution {

    readonly id = TYPESCRIPT_LANGUAGE_ID;
    readonly name = TYPESCRIPT_LANGUAGE_NAME;

    @inject(TypescriptPreferences)
    protected readonly preferences: TypescriptPreferences;

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

    protected get initializationOptions(): TypeScriptInitializationOptions {
        const options: TypeScriptInitializationOptions = {};
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

}
