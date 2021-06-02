/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { Argv, Arguments } from '@theia/core/shared/yargs';
import { CliContribution } from '@theia/core/lib/node';

let pluginHostTerminateTimeout = 10 * 1000;
if (process.env.PLUGIN_HOST_TERMINATE_TIMEOUT) {
    pluginHostTerminateTimeout = Number.parseInt(process.env.PLUGIN_HOST_TERMINATE_TIMEOUT);
}

let pluginHostStopTimeout = 4 * 1000;
if (process.env.PLUGIN_HOST_STOP_TIMEOUT) {
    pluginHostStopTimeout = Number.parseInt(process.env.PLUGIN_HOST_STOP_TIMEOUT);
}

@injectable()
export class HostedPluginCliContribution implements CliContribution {

    static EXTENSION_TESTS_PATH = 'extensionTestsPath';
    static PLUGIN_HOST_TERMINATE_TIMEOUT = 'pluginHostTerminateTimeout';
    static PLUGIN_HOST_STOP_TIMEOUT = 'pluginHostStopTimeout';

    protected _extensionTestsPath: string | undefined;
    get extensionTestsPath(): string | undefined {
        return this._extensionTestsPath;
    }

    protected _pluginHostTerminateTimeout = pluginHostTerminateTimeout;
    get pluginHostTerminateTimeout(): number {
        return this._pluginHostTerminateTimeout;
    }

    protected _pluginHostStopTimeout = pluginHostStopTimeout;
    get pluginHostStopTimeout(): number {
        return this._pluginHostStopTimeout;
    }

    configure(conf: Argv): void {
        conf.option(HostedPluginCliContribution.EXTENSION_TESTS_PATH, {
            type: 'string'
        });
        conf.option(HostedPluginCliContribution.PLUGIN_HOST_TERMINATE_TIMEOUT, {
            type: 'number',
            default: pluginHostTerminateTimeout,
            description: 'Timeout in milliseconds to wait for the plugin host process to terminate before killing it. Use 0 for no timeout.'
        });
        conf.option(HostedPluginCliContribution.PLUGIN_HOST_STOP_TIMEOUT, {
            type: 'number',
            default: pluginHostStopTimeout,
            description: 'Timeout in milliseconds to wait for the plugin host process to stop internal services. Use 0 for no timeout.'
        });
    }

    setArguments(args: Arguments): void {
        this._extensionTestsPath = args[HostedPluginCliContribution.EXTENSION_TESTS_PATH] as string;
        this._pluginHostTerminateTimeout = args[HostedPluginCliContribution.PLUGIN_HOST_TERMINATE_TIMEOUT] as number;
        this._pluginHostStopTimeout = args[HostedPluginCliContribution.PLUGIN_HOST_STOP_TIMEOUT] as number;
    }

}
