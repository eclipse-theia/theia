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

import * as theia from '@theia/plugin';
import * as path from 'path';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-configuration';
import { PlatformSpecificAdapterContribution, DebuggerContribution } from '../../../common';
import { CommandRegistryImpl } from '../../command-registry';
import { IJSONSchemaSnippet, IJSONSchema } from '@theia/core/lib/common/json-schema';
import { isWindows, isOSX } from '@theia/core/lib/common/os';
import { DebugAdapterExecutable } from '@theia/debug/lib/common/debug-model';

export class PluginDebugAdapterContribution {
    constructor(
        protected readonly debugType: string,
        protected readonly provider: theia.DebugConfigurationProvider,
        protected readonly debuggerContribution: DebuggerContribution,
        protected readonly commandRegistryExt: CommandRegistryImpl,
        protected readonly pluginPath: string) {
    }

    async provideDebugConfigurations(workspaceFolderUri?: string): Promise<DebugConfiguration[]> {
        if (this.provider.provideDebugConfigurations) {
            return await this.provider.provideDebugConfigurations(undefined) || [];
        }

        return [];
    }

    async resolveDebugConfiguration(config: DebugConfiguration, workspaceFolderUri?: string): Promise<DebugConfiguration | undefined> {
        if (this.provider.resolveDebugConfiguration) {
            return this.provider.resolveDebugConfiguration(undefined, config);
        }

        return config;
    }

    async getSupportedLanguages(): Promise<string[]> {
        return this.debuggerContribution.languages || [];
    }

    async provideDebugAdapterExecutable(debugConfiguration: theia.DebugConfiguration): Promise<DebugAdapterExecutable> {
        if (this.debuggerContribution.adapterExecutableCommand) {
            return await this.commandRegistryExt.executeCommand(this.debuggerContribution.adapterExecutableCommand, []) as DebugAdapterExecutable;
        }

        const info = this.toPlatformInfo(this.debuggerContribution);
        let program = (info && info.program || this.debuggerContribution.program);
        if (!program) {
            throw new Error('It is not possible to provide debug adapter executable. Program not found.');
        }
        program = path.join(this.pluginPath, program);
        const programArgs = info && info.args || this.debuggerContribution.args || [];
        let runtime = info && info.runtime || this.debuggerContribution.runtime;
        if (runtime && runtime.indexOf('./') === 0) {
            runtime = path.join(this.pluginPath, runtime);
        }
        const runtimeArgs = info && info.runtimeArgs || this.debuggerContribution.runtimeArgs || [];
        const command = runtime ? runtime : program;
        const args = runtime ? [...runtimeArgs, program, ...programArgs] : programArgs;
        return {
            command,
            args
        };
    }

    async getSchemaAttributes(): Promise<IJSONSchema[]> {
        return this.debuggerContribution.configurationAttributes || [];
    }

    async getConfigurationSnippets(): Promise<IJSONSchemaSnippet[]> {
        return this.debuggerContribution.configurationSnippets || [];
    }

    protected toPlatformInfo(executable: DebuggerContribution): PlatformSpecificAdapterContribution | undefined {
        if (isWindows && !process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432')) {
            return executable.winx86 || executable.win || executable.windows;
        }
        if (isWindows) {
            return executable.win || executable.windows;
        }
        if (isOSX) {
            return executable.osx;
        }
        return executable.linux;
    }
}
