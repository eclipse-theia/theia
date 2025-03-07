// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import {
    DebugConfigurationProvider,
    DebugConfigurationProviderDescriptor,
    DebugConfigurationProviderTriggerKind,
    DebugExt
} from '../../../common/plugin-api-rpc';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-configuration';

export class PluginDebugConfigurationProvider implements DebugConfigurationProvider {
    /**
     * After https://github.com/eclipse-theia/theia/pull/13196, the debug config handles might change.
     * Store the original handle to be able to call the extension host when getting by handle.
     */
    protected readonly originalHandle: number;
    public handle: number;
    public type: string;
    public triggerKind: DebugConfigurationProviderTriggerKind;
    provideDebugConfigurations: (folder: string | undefined) => Promise<DebugConfiguration[]>;
    resolveDebugConfiguration: (
        folder: string | undefined,
        debugConfiguration: DebugConfiguration
    ) => Promise<DebugConfiguration | undefined | null>;
    resolveDebugConfigurationWithSubstitutedVariables: (
        folder: string | undefined,
        debugConfiguration: DebugConfiguration
    ) => Promise<DebugConfiguration | undefined | null>;

    constructor(
        description: DebugConfigurationProviderDescriptor,
        protected readonly debugExt: DebugExt
    ) {
        this.handle = description.handle;
        this.originalHandle = this.handle;
        this.type = description.type;
        this.triggerKind = description.trigger;

        if (description.provideDebugConfiguration) {
            this.provideDebugConfigurations = async (folder: string | undefined) => this.debugExt.$provideDebugConfigurationsByHandle(this.originalHandle, folder);
        }

        if (description.resolveDebugConfigurations) {
            this.resolveDebugConfiguration =
                async (folder: string | undefined, debugConfiguration: DebugConfiguration) =>
                    this.debugExt.$resolveDebugConfigurationByHandle(this.originalHandle, folder, debugConfiguration);
        }

        if (description.resolveDebugConfigurationWithSubstitutedVariables) {
            this.resolveDebugConfigurationWithSubstitutedVariables =
                async (folder: string | undefined, debugConfiguration: DebugConfiguration) =>
                    this.debugExt.$resolveDebugConfigurationWithSubstitutedVariablesByHandle(this.originalHandle, folder, debugConfiguration);
        }
    }
}
