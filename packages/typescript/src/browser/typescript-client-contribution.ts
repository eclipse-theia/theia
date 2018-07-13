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

import { injectable, inject } from "inversify";
import { BaseLanguageClientContribution, Workspace, Languages, LanguageClientFactory } from '@theia/languages/lib/browser';
import { TYPESCRIPT_LANGUAGE_ID, TYPESCRIPT_LANGUAGE_NAME, TYPESCRIPT_REACT_LANGUAGE_ID, JAVASCRIPT_LANGUAGE_ID, JAVASCRIPT_REACT_LANGUAGE_ID } from '../common';

@injectable()
export class TypeScriptClientContribution extends BaseLanguageClientContribution {

    readonly id = TYPESCRIPT_LANGUAGE_ID;
    readonly name = TYPESCRIPT_LANGUAGE_NAME;

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(LanguageClientFactory) protected readonly languageClientFactory: LanguageClientFactory
    ) {
        super(workspace, languages, languageClientFactory);
    }

    protected get globPatterns(): string[] {
        return [
            '**/*.ts',
            '**/*.tsx',
            '**/*.js',
            '**/*.jsx'
        ];
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
            "tsconfig.json",
            "jsconfig.json"
        ];
    }

}
