// *****************************************************************************
// Copyright (C) 2022 Arm and others.
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

import * as theia from '@theia/plugin';
import { DebugAdapter } from '@theia/debug/lib/common/debug-model';
import { PluginPackageDebuggersContribution } from '../../common';
import { DebugAdapterInlineImplementation } from '../types-impl';
import { InlineDebugAdapter } from '@theia/debug/lib/common/inline-debug-adapter';

export class PluginDebugAdapterCreator {
    public async resolveDebugAdapterExecutable(_pluginPath: string, _debuggerContribution: PluginPackageDebuggersContribution): Promise<theia.DebugAdapterExecutable | undefined> {
        // Node is required to run the default executable
        return undefined;
    }

    public async createDebugAdapter(
        session: theia.DebugSession,
        _debugConfiguration: theia.DebugConfiguration,
        executable: theia.DebugAdapterExecutable | undefined,
        descriptorFactory: theia.DebugAdapterDescriptorFactory | undefined
    ): Promise<DebugAdapter> {
        if (descriptorFactory) {
            const descriptor = await descriptorFactory.createDebugAdapterDescriptor(session, executable);
            if (descriptor) {
                if (DebugAdapterInlineImplementation.is(descriptor)) {
                    return this.connectInlineDebugAdapter(descriptor);
                }
            }
        }

        throw new Error('It is not possible to provide debug adapter executable.');
    }

    public connectInlineDebugAdapter(adapter: DebugAdapterInlineImplementation): InlineDebugAdapter {
        return new InlineDebugAdapter(adapter.implementation);
    }
}
