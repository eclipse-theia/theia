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

import { nls } from '@theia/core';
import { PreferenceContribution, PreferenceProxy, PreferenceSchema } from '@theia/core/lib/browser';
import { PreferenceProxyFactory } from '@theia/core/lib/browser/preferences/injectable-preference-proxy';
import { interfaces } from '@theia/core/shared/inversify';
import {
    NOTIFICATION_TYPES,
    NOTIFICATION_TYPE_OFF,
    NotificationType
} from '../common/notification-types';

export const AI_CORE_PREFERENCES_TITLE = nls.localize('theia/ai/core/prefs/title', '✨ AI Features [Beta]');
export const PREFERENCE_NAME_ENABLE_AI = 'ai-features.AiEnable.enableAI';
export const PREFERENCE_NAME_PROMPT_TEMPLATES = 'ai-features.promptTemplates.promptTemplatesFolder';
export const PREFERENCE_NAME_REQUEST_SETTINGS = 'ai-features.modelSettings.requestSettings';
export const PREFERENCE_NAME_MAX_RETRIES = 'ai-features.modelSettings.maxRetries';
export const PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE = 'ai-features.notifications.default';

export const aiCorePreferenceSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [PREFERENCE_NAME_ENABLE_AI]: {
            title: AI_CORE_PREFERENCES_TITLE,
            markdownDescription: nls.localize('theia/ai/core/enableAI/mdDescription',
                '❗ This setting allows you to access the latest AI capabilities (Beta version).\
            \n\
            Please note that these features are in a beta phase, which means they may \
            undergo changes and will be further improved. It is important to be aware that these features may generate\
            continuous requests to the language models (LLMs) you provide access to. This might incur costs that you\
            need to monitor closely. By enabling this option, you acknowledge these risks.\
            \n\
            **Please note! The settings below in this section will only take effect\n\
            once the main feature setting is enabled. After enabling the feature, you need to configure at least one\
            LLM provider below. Also see [the documentation](https://theia-ide.org/docs/user_ai/)**.'),
            type: 'boolean',
            default: false,
        },
        [PREFERENCE_NAME_PROMPT_TEMPLATES]: {
            title: AI_CORE_PREFERENCES_TITLE,
            description: nls.localize('theia/ai/core/promptTemplates/description',
                'Folder for storing customized prompt templates. If not customized the user config directory is used. Please consider to use a folder, which is\
            under version control to manage your variants of prompt templates.'),
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
        },
        [PREFERENCE_NAME_REQUEST_SETTINGS]: {
            title: nls.localize('theia/ai/core/requestSettings/title', 'Custom Request Settings'),
            markdownDescription: nls.localize('theia/ai/core/requestSettings/mdDescription', 'Allows specifying custom request settings for multiple models.\n\
            Each setting consists of:\n\
            - `scope`: Defines when the setting applies:\n\
              - `modelId` (optional): The model ID to match\n\
              - `providerId` (optional): The provider ID to match (e.g., huggingface, openai, ollama, llamafile)\n\
              - `agentId` (optional): The agent ID to match\n\
            - `requestSettings`: Model-specific settings as key-value pairs\n\
            - `clientSettings`: Client-side message handling settings:\n\
              - `keepToolCalls` (boolean): Whether to keep tool calls in the context\n\
              - `keepThinking` (boolean): Whether to keep thinking messages\n\
            Settings are matched based on specificity (agent: 100, model: 10, provider: 1 points).\n\
            Refer to [our documentation](https://theia-ide.org/docs/user_ai/#custom-request-settings) for more information.'),
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    scope: {
                        type: 'object',
                        properties: {
                            modelId: {
                                type: 'string',
                                description: 'The (optional) model id'
                            },
                            providerId: {
                                type: 'string',
                                description: 'The (optional) provider id to apply the settings to.',
                            }, agentId: {
                                type: 'string',
                                description: 'The (optional) agent id to apply the settings to.',
                            },
                        }
                    },
                    requestSettings: {
                        type: 'object',
                        additionalProperties: true,
                        description: 'Settings for the specific model ID.',
                    },
                    clientSettings: {
                        type: 'object',
                        additionalProperties: false,
                        description: 'Client settings for how to handle messages that are send back to the llm.',
                        properties: {
                            keepToolCalls: {
                                type: 'boolean',
                                default: true,
                                description: 'If set to false, all tool request and tool responses will be filtered \
                                before sending the next user request in a multi-turn conversation.'
                            },
                            keepThinking: {
                                type: 'boolean',
                                default: true,
                                description: 'If set to false, all thinking output will be filtered before sending the next user request in a multi-turn conversation.'
                            }
                        }
                    },
                },
                additionalProperties: false
            },
            default: [],
        },
        [PREFERENCE_NAME_MAX_RETRIES]: {
            title: nls.localize('theia/ai/core/maxRetries/title', 'Maximum Retries'),
            markdownDescription: nls.localize('theia/ai/core/maxRetries/mdDescription',
                'The maximum number of retry attempts when a request to an AI provider fails. A value of 0 means no retries.'),
            type: 'number',
            minimum: 0,
            default: 3
        },
        [PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE]: {
            title: nls.localize('theia/ai/core/defaultNotification/title', 'Default Notification Type'),
            markdownDescription: nls.localize('theia/ai/core/defaultNotification/mdDescription',
                'The default notification method used when an AI agent completes a task. Individual agents can override this setting.\n\
                - `os-notification`: Show OS/system notifications\n\
                - `message`: Show notifications in the status bar/message area\n\
                - `blink`: Blink or highlight the UI\n\
                - `off`: Disable all notifications'),
            type: 'string',
            enum: [...NOTIFICATION_TYPES],
            default: NOTIFICATION_TYPE_OFF
        }
    }
};

export interface AICoreConfiguration {
    [PREFERENCE_NAME_ENABLE_AI]: boolean | undefined;
    [PREFERENCE_NAME_PROMPT_TEMPLATES]: string | undefined;
    [PREFERENCE_NAME_REQUEST_SETTINGS]: Array<RequestSetting> | undefined;
    [PREFERENCE_NAME_MAX_RETRIES]: number | undefined;
    [PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE]: NotificationType | undefined;
}

export interface RequestSetting {
    scope?: Scope;
    clientSettings?: { keepToolCalls: boolean; keepThinking: boolean };
    requestSettings?: { [key: string]: unknown };
}

export interface Scope {
    modelId?: string;
    providerId?: string;
    agentId?: string;
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

/**
 * Calculates the specificity score of a RequestSetting for a given scope.
 * The score is calculated based on matching criteria:
 * - Agent match: 100 points
 * - Model match: 10 points
 * - Provider match: 1 point
 *
 * @param setting RequestSetting object to check against
 * @param scope Optional scope object containing modelId, providerId, and agentId
 * @returns Specificity score (-1 for non-match, or sum of matching criteria points)
 */
export const getRequestSettingSpecificity = (setting: RequestSetting, scope?: Scope): number => {
    // If no scope is defined in the setting, return default specificity
    if (!setting.scope) {
        return 0;
    }

    // If no matching criteria are defined in the scope, return default specificity
    if (!setting.scope.modelId && !setting.scope.providerId && !setting.scope.agentId) {
        return 0;
    }

    // Check for explicit non-matches (return -1)
    if (scope?.modelId && setting.scope.modelId && setting.scope.modelId !== scope.modelId) {
        return -1;
    }

    if (scope?.providerId && setting.scope.providerId && setting.scope.providerId !== scope.providerId) {
        return -1;
    }

    if (scope?.agentId && setting.scope.agentId && setting.scope.agentId !== scope.agentId) {
        return -1;
    }

    let specificity = 0;

    // Check provider match (1 point)
    if (scope?.providerId && setting.scope.providerId === scope.providerId) {
        specificity += 1;
    }

    // Check model match (10 points)
    if (scope?.modelId && setting.scope.modelId === scope.modelId) {
        specificity += 10;
    }

    // Check agent match (100 points)
    if (scope?.agentId && setting.scope.agentId === scope.agentId) {
        specificity += 100;
    }

    return specificity;
};
