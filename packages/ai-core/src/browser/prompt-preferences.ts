// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { PreferenceSchema, PreferenceProxy, PreferenceContribution, FrontendApplicationContribution, PreferenceService, PreferenceScope } from '@theia/core/lib/browser';
import { interfaces, inject, injectable } from '@theia/core/shared/inversify';
import { PreferenceProxyFactory } from '@theia/core/lib/browser/preferences/injectable-preference-proxy';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { URI } from '@theia/core';

export const promptServicePreferenceSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'ai-chat.templates-folder': {
            description: 'Path of the folder containing custom prompt templates',
            type: 'string',
            default: '',
            typeDetails: {
                isFilepath: true,
                selectionProps: {
                    openLabel: 'Select Folder',
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false
                }
            }
        }
    }
};
export interface PromptConfiguration {
    'ai-chat.templates-folder': string | undefined;
}

export const PromptPreferences = Symbol('PromptsPreferences');
export type PromptPreferences = PreferenceProxy<PromptConfiguration>;

export function bindPromptPreferences(bind: interfaces.Bind): void {
    bind(PromptPreferences).toDynamicValue(ctx => {
        const factory = ctx.container.get<PreferenceProxyFactory>(PreferenceProxyFactory);
        return factory(promptServicePreferenceSchema);
    }).inSingletonScope();
    bind(PreferenceContribution).toConstantValue({ schema: promptServicePreferenceSchema });
    bind(FrontendApplicationContribution).to(TheiaDirFrontendContribution).inSingletonScope();
}

@injectable()
export class TheiaDirFrontendContribution implements FrontendApplicationContribution {

    @inject(EnvVariablesServer)
    protected readonly envVariablesServer: EnvVariablesServer;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    async onDidInitializeLayout(): Promise<void> {
        if (!this.preferenceService.get('ai-chat.templates-folder')) {
            // Initialize the templates-folder. By default, create a 'templates-folder'
            // directory inside of the Theia Config dir.
            const theiaConfigDir = await this.envVariablesServer.getConfigDirUri();
            const templatesDirUri = new URI(theiaConfigDir).resolve('prompt-templates');
            // FIXME: Supports Windows paths (trim leading / on windows)
            this.preferenceService.set('ai-chat.templates-folder', templatesDirUri.path.toString(), PreferenceScope.User);
        }
    }
}
