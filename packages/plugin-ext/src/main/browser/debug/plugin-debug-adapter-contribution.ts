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

import { DebugExt, } from '../../../api/plugin-api';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-configuration';
import { IJSONSchemaSnippet, IJSONSchema } from '@theia/core/lib/common/json-schema';
import { MaybePromise } from '@theia/core/lib/common/types';
import { DebugAdapterContribution } from '@theia/debug/lib/common/debug-model';

/**
 * Plugin [DebugAdapterContribution](#DebugAdapterContribution) with functionality
 * to create / terminated debug adapter session.
 */
export class PluginDebugAdapterContribution implements DebugAdapterContribution {
    constructor(
        readonly type: string,
        readonly label: MaybePromise<string | undefined>,
        readonly languages: MaybePromise<string[] | undefined>,
        protected readonly contributorId: string,
        protected readonly debugExt: DebugExt) { }

    async provideDebugConfigurations(workspaceFolderUri: string | undefined): Promise<DebugConfiguration[]> {
        return this.debugExt.$provideDebugConfigurations(this.contributorId, workspaceFolderUri);
    }

    async resolveDebugConfiguration(config: DebugConfiguration, workspaceFolderUri: string | undefined): Promise<DebugConfiguration | undefined> {
        return this.debugExt.$resolveDebugConfigurations(this.contributorId, config, workspaceFolderUri);
    }

    async getSchemaAttributes(): Promise<IJSONSchema[]> {
        return this.debugExt.$getSchemaAttributes(this.contributorId);
    }

    async getConfigurationSnippets(): Promise<IJSONSchemaSnippet[]> {
        return this.debugExt.$getConfigurationSnippets(this.contributorId);
    }

    async createDebugSession(debugConfiguration: DebugConfiguration): Promise<string> {
        return this.debugExt.$createDebugSession(this.contributorId, debugConfiguration);
    }

    async terminateDebugSession(sessionId: string): Promise<void> {
        return this.debugExt.$terminateDebugSession(sessionId);
    }
}
