// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { PreferenceProxy } from '@theia/core/lib/common/preferences/preference-proxy';
import { nls } from '@theia/core/lib/common/nls';
import { PreferenceProxyFactory } from '@theia/core/lib/common/preferences/injectable-preference-proxy';
import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/common/preferences/preference-schema';

export const DevContainerPreferenceSchema: PreferenceSchema = {
    properties: {
        'devcontainer.attach.applyFoundConfig': {
            type: 'string',
            enum: ['always', 'ask', 'never'],
            default: 'ask',
            markdownDescription: nls.localize(
                'theia/devContainer/attach/applyFoundConfig',
                'Controls whether to apply a devcontainer.json found inside a container when attaching. '
                + 'Extensions, settings, port forwarding, and post-attach commands from the configuration will be applied.'
            )
        }
    }
};

export interface DevContainerPreferenceConfiguration {
    'devcontainer.attach.applyFoundConfig': 'always' | 'ask' | 'never';
}

export const DevContainerPreferenceContribution = Symbol('DevContainerPreferenceContribution');
export const DevContainerPreferences = Symbol('DevContainerPreferences');
export type DevContainerPreferences = PreferenceProxy<DevContainerPreferenceConfiguration>;

export function bindDevContainerPreferences(bind: interfaces.Bind): void {
    bind(DevContainerPreferences).toDynamicValue(ctx => {
        const factory = ctx.container.get<PreferenceProxyFactory>(PreferenceProxyFactory);
        return factory(DevContainerPreferenceSchema);
    }).inSingletonScope();
    bind(DevContainerPreferenceContribution).toConstantValue({ schema: DevContainerPreferenceSchema });
    bind(PreferenceContribution).toService(DevContainerPreferenceContribution);
}
