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

import { inject, injectable } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { PluginHostNavigatorState, SUPPORT_NODE_GLOBAL_NAVIGATOR_PREF } from '../common/plugin-host-environment-preferences';

/**
 * Keeps {@link PluginHostNavigatorState} in sync with the navigator preference.
 *
 * `PreferenceService` has async dependencies and cannot be injected in
 * connection-scoped containers. This contribution runs in the root container
 * and mutates the shared state object by reference so that
 * `HostedPluginProcess` (connection-scoped) always sees the latest value.
 */
@injectable()
export class PluginHostNavigatorStateInitializer implements BackendApplicationContribution {

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(PluginHostNavigatorState)
    protected readonly state: PluginHostNavigatorState;

    onStart(): void {
        this.state.supportNodeGlobalNavigator = this.preferences.get<boolean>(SUPPORT_NODE_GLOBAL_NAVIGATOR_PREF, false);
        this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === SUPPORT_NODE_GLOBAL_NAVIGATOR_PREF) {
                this.state.supportNodeGlobalNavigator = this.preferences.get<boolean>(SUPPORT_NODE_GLOBAL_NAVIGATOR_PREF, false);
            }
        });
    }
}
