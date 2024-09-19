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

import { PreferenceContribution, PreferenceProxy, PreferenceSchema } from '@theia/core/lib/browser';
import { PreferenceProxyFactory } from '@theia/core/lib/browser/preferences/injectable-preference-proxy';
import { interfaces } from '@theia/core/shared/inversify';

export const AI_CORE_PREFERENCES_TITLE = '✨ AI Features [Experimental]';
export const PREFERENCE_NAME_ENABLE_EXPERIMENTAL = 'ai-features.AiEnable.enableAI';
export const PREFERENCE_NAME_PROMPT_TEMPLATES = 'ai-features.promptTemplates.promptTemplatesFolder';

export const aiCorePreferenceSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [PREFERENCE_NAME_ENABLE_EXPERIMENTAL]: {
            title: AI_CORE_PREFERENCES_TITLE,
            markdownDescription: '❗ This setting allows you to access and experiment with our latest AI capabilities.\
            \n\
            Please note that these features are in an experimental phase, which means they may be unstable,\
            undergo significant changes, or incur additional costs.\
            \n\
            By enabling this option, you acknowledge these risks and agree to provide feedback to help us improve.\
            &nbsp;\n\
            **Please note! The settings below in this section will only take effect\n\
            once the main feature setting is enabled.**',
            type: 'boolean',
            default: false,
        },
        [PREFERENCE_NAME_PROMPT_TEMPLATES]: {
            title: AI_CORE_PREFERENCES_TITLE,
            description: 'Folder for storing customized prompt templates. If not customized the user config directory is used. Please consider to use a folder, which is\
            under version control to manage your variants of prompt templates.',
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
            },

        }
    }
};
export interface AICoreConfiguration {
    [PREFERENCE_NAME_ENABLE_EXPERIMENTAL]: boolean | undefined;
    [PREFERENCE_NAME_PROMPT_TEMPLATES]: string | undefined;
}

export const AICorePreferences = Symbol('AICorePreferences');
export type AICorePreferences = PreferenceProxy<AICoreConfiguration>;

export function bindAICorePreferences(bind: interfaces.Bind): void {
    bind(AICorePreferences).toDynamicValue(ctx => {
        const factory = ctx.container.get<PreferenceProxyFactory>(PreferenceProxyFactory);
        return factory(aiCorePreferenceSchema);
    }).inSingletonScope();
    bind(PreferenceContribution).toConstantValue({ schema: aiCorePreferenceSchema });
}
