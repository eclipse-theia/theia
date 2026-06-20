// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/common/preferences';
import { nls } from '@theia/core/lib/common/nls';

export const SUPPORT_NODE_GLOBAL_NAVIGATOR_PREF = 'extensions.supportNodeGlobalNavigator';

export const PluginHostEnvironmentPreferenceSchema: PreferenceSchema = {
    properties: {
        [SUPPORT_NODE_GLOBAL_NAVIGATOR_PREF]: {
            type: 'boolean',
            description: nls.localize('theia/plugin-ext/supportNodeGlobalNavigator',
                'If enabled, the global navigator object in the extension host will be defined as provided by Node.js. '
                + 'Extensions may use the presence of the navigator object as a hint that code is running in a browser. '
                + 'Disabling this (the default) undefines the navigator in the extension host to preserve this assumption.'),
            default: false,
        }
    }
};

/**
 * Mutable state holder for the navigator preference, injected as a constant value
 * so it can be safely resolved in connection-scoped containers (no async dependencies).
 */
export const PluginHostNavigatorState = Symbol('PluginHostNavigatorState');
export interface PluginHostNavigatorState {
    supportNodeGlobalNavigator: boolean;
}

export function bindPluginHostEnvironmentPreferences(bind: interfaces.Bind): void {
    bind(PreferenceContribution).toConstantValue({ schema: PluginHostEnvironmentPreferenceSchema });
    bind(PluginHostNavigatorState).toConstantValue({ supportNodeGlobalNavigator: false });
}
