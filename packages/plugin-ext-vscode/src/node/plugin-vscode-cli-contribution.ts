// *****************************************************************************
// Copyright (C) 2019 Red Hat, Inc. and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { Argv, Arguments } from '@theia/core/shared/yargs';
import { CliContribution } from '@theia/core/lib/node/cli';
import { PluginHostEnvironmentVariable } from '@theia/plugin-ext/lib/common';
import { VSCODE_DEFAULT_API_VERSION } from '../common/plugin-vscode-types';
import { Deferred } from '@theia/core/lib/common/promise-util';

/**
 * CLI Contribution allowing to override the VS Code API version which is returned by `vscode.version` API call.
 */
@injectable()
export class PluginVsCodeCliContribution implements CliContribution, PluginHostEnvironmentVariable {

    /**
     * CLI argument name to define the supported VS Code API version.
     */
    static VSCODE_API_VERSION = 'vscode-api-version';

    protected vsCodeApiVersion?: string;
    protected vsCodeApiVersionDeferred = new Deferred<string>();

    get vsCodeApiVersionPromise(): Promise<string> {
        return this.vsCodeApiVersionDeferred.promise;
    }

    configure(conf: Argv): void {
        conf.option(PluginVsCodeCliContribution.VSCODE_API_VERSION, {
            // eslint-disable-next-line max-len
            description: `Overrides the version returned by VSCode API 'vscode.version'. Example: --${PluginVsCodeCliContribution.VSCODE_API_VERSION}=<Wanted Version>. Default [${VSCODE_DEFAULT_API_VERSION}]`,
            type: 'string',
            nargs: 1
        });
    }

    setArguments(args: Arguments): void {
        const arg = args[PluginVsCodeCliContribution.VSCODE_API_VERSION] as string | undefined;
        this.vsCodeApiVersion = arg?.trim() || process.env['VSCODE_API_VERSION']?.trim() || VSCODE_DEFAULT_API_VERSION;
        process.env['VSCODE_API_VERSION'] = this.vsCodeApiVersion;
        this.vsCodeApiVersionDeferred.resolve(this.vsCodeApiVersion);
    }

    process(env: NodeJS.ProcessEnv): void {
        if (this.vsCodeApiVersion) {
            env['VSCODE_API_VERSION'] = this.vsCodeApiVersion;
        }
    }

}
