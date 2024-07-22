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

import { PreferenceSchema, PreferenceProxy, PreferenceContribution } from '@theia/core/lib/browser';
import { interfaces } from '@theia/core/shared/inversify';
import { PreferenceProxyFactory } from '@theia/core/lib/browser/preferences/injectable-preference-proxy';

export const promptServicePreferenceSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        prompts: {
            description: 'List of paths to exclude from the filesystem watcher',
            type: 'object',
            patternProperties: {
                '*': { type: 'string' }
            }
        }
    }
};
export interface PromptConfiguration {
    'prompts': { [key: string]: string }
}

export const PromptPreferences = Symbol('PromptsPreferences');
export type PromptPreferences = PreferenceProxy<PromptConfiguration>;

export function bindPromptPreferences(bind: interfaces.Bind): void {
    bind(PromptPreferences).toDynamicValue(ctx => {
        const factory = ctx.container.get<PreferenceProxyFactory>(PreferenceProxyFactory);
        return factory(promptServicePreferenceSchema);
    }).inSingletonScope();
    bind(PreferenceContribution).toConstantValue({ schema: promptServicePreferenceSchema });
}
