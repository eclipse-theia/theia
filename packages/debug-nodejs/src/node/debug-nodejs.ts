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

import { injectable } from 'inversify';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-configuration';
import { DebugAdapterContribution, DebugAdapterExecutable } from '@theia/debug/lib/node/debug-model';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import { getSchemaAttributes } from './package-json-parser';

const path = require('path'); // FIXME use import
const packageJson = require('../../package.json');
const debugAdapterDir = packageJson['debugAdapter']['dir'] + '/extension';
const psList = require('ps-list'); // FIXME use import, provide proper d.ts file instead of any
const DEBUG_PORT_PATTERN = /--(inspect|debug)-port=(\d+)/;
const DEFAULT_PROTOCOL = 'inspector';
const DEFAULT_INSPECTOR_PORT = 9229;

@injectable()
export class NodeJsDebugAdapterContribution implements DebugAdapterContribution {
    readonly debugType = 'node';

    provideDebugConfigurations = [{
        type: this.debugType,
        request: 'attach',
        name: 'Debug (Attach)',
        processId: ''
    }];

    getSchemaAttributes(): Promise<IJSONSchema[]> {
        return getSchemaAttributes(path.join(__dirname, `../../${debugAdapterDir}`), this.debugType);
    }
    async resolveDebugConfiguration(config: DebugConfiguration): Promise<DebugConfiguration> {
        if (!config.request) {
            throw new Error('Debug request type is not provided.');
        }

        switch (config.request) {
            case 'attach': return this.resolveAttachConfiguration(config);
            case 'launch': return this.resolveLaunchConfiguration(config);
        }

        throw new Error(`Unknown request type ${config.request}`);
    }

    async provideDebugAdapterExecutable(config: DebugConfiguration): Promise<DebugAdapterExecutable> {
        const program = path.join(__dirname, `../../${debugAdapterDir}/out/src/nodeDebug.js`);
        return {
            program,
            runtime: 'node'
        };
    }

    private async resolveLaunchConfiguration(config: DebugConfiguration): Promise<DebugConfiguration> {
        return config;
    }

    private async resolveAttachConfiguration(config: DebugConfiguration): Promise<DebugConfiguration> {
        config.protocol = DEFAULT_PROTOCOL;
        config.port = DEFAULT_INSPECTOR_PORT;

        const pidToDebug = Number.parseInt(config.processId);

        const tasks: [{ pid: number, cmd: string }] = await psList();
        const taskToDebug = tasks.find(task => task.pid === pidToDebug);
        if (taskToDebug) {
            const matches = DEBUG_PORT_PATTERN.exec(taskToDebug.cmd);
            if (matches && matches.length === 3) {
                config.port = parseInt(matches[2]);
                config.protocol = matches[1] === 'debug' ? 'legacy' : 'inspector';
            }
        }

        delete config.processId;

        return config;
    }
}
