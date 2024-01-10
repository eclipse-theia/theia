// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { interfaces } from '@theia/core/shared/inversify';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceContribution,
    PreferenceSchema
} from '@theia/core/lib/browser/preferences';
import { nls } from '@theia/core/lib/common/nls';

const frontendConfig = FrontendApplicationConfigProvider.get();

export const WebviewConfigSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'webview.trace': {
            type: 'string',
            enum: ['off', 'on', 'verbose'],
            description: nls.localize('theia/plugin-ext/webviewTrace', 'Controls communication tracing with webviews.'),
            default: 'off'
        }
    }
};

if (frontendConfig.securityWarnings) {
    WebviewConfigSchema.properties['webview.warnIfUnsecure'] = {
        scope: 'application',
        type: 'boolean',
        description: nls.localize('theia/plugin-ext/webviewWarnIfUnsecure', 'Warns users that webviews are currently deployed unsecurely.'),
        default: true,
    };
}

export interface WebviewConfiguration {
    'webview.trace': 'off' | 'on' | 'verbose'
    'webview.warnIfUnsecure'?: boolean
}

export const WebviewPreferenceContribution = Symbol('WebviewPreferenceContribution');
export const WebviewPreferences = Symbol('WebviewPreferences');
export type WebviewPreferences = PreferenceProxy<WebviewConfiguration>;

export function createWebviewPreferences(preferences: PreferenceService, schema: PreferenceSchema = WebviewConfigSchema): WebviewPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindWebviewPreferences(bind: interfaces.Bind): void {
    bind(WebviewPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(WebviewPreferenceContribution);
        return createWebviewPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(WebviewPreferenceContribution).toConstantValue({ schema: WebviewConfigSchema });
    bind(PreferenceContribution).toService(WebviewPreferenceContribution);
}
