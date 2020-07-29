/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { DebugExt, } from '../../../common/plugin-api-rpc';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-configuration';
import { MaybePromise } from '@theia/core/lib/common/types';
import { DebuggerDescription } from '@theia/debug/lib/common/debug-service';
import { HostedPluginSupport } from '../../../hosted/browser/hosted-plugin';

/**
 * Plugin [DebugAdapterContribution](#DebugAdapterContribution).
 */
export class PluginDebugAdapterContribution {
    constructor(
        protected readonly description: DebuggerDescription,
        protected readonly debugExt: DebugExt,
        protected readonly pluginService: HostedPluginSupport) { }

    get type(): string {
        return this.description.type;
    }

    get label(): MaybePromise<string | undefined> {
        return this.description.label;
    }

    async provideDebugConfigurations(workspaceFolderUri: string | undefined): Promise<DebugConfiguration[]> {
        return this.debugExt.$provideDebugConfigurations(this.type, workspaceFolderUri);
    }

    async resolveDebugConfiguration(config: DebugConfiguration, workspaceFolderUri: string | undefined): Promise<DebugConfiguration | undefined> {
        return this.debugExt.$resolveDebugConfigurations(config, workspaceFolderUri);
    }

    async resolveDebugConfigurationWithSubstitutedVariables(config: DebugConfiguration, workspaceFolderUri: string | undefined): Promise<DebugConfiguration | undefined> {
        return this.debugExt.$resolveDebugConfigurationWithSubstitutedVariables(config, workspaceFolderUri);
    }

    async createDebugSession(config: DebugConfiguration): Promise<string> {
        await this.pluginService.activateByDebug('onDebugAdapterProtocolTracker', config.type);
        return this.debugExt.$createDebugSession(config);
    }

    async terminateDebugSession(sessionId: string): Promise<void> {
        this.debugExt.$terminateDebugSession(sessionId);
    }
}
