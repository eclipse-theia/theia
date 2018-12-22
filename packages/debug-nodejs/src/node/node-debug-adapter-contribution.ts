/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import * as path from 'path';
const psList: () => Promise<[{ pid: number, cmd: string }]> = require('ps-list'); // FIXME use import, provide proper d.ts file
import { injectable } from 'inversify';
// tslint:disable-next-line:no-implicit-dependencies
import { FileUri } from '@theia/core/lib/node';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-configuration';
import { AbstractVSCodeDebugAdapterContribution } from '@theia/debug/lib/node/vscode/vscode-debug-adapter-contribution';

export const INSPECTOR_PORT_DEFAULT = 9229;
export const LEGACY_PORT_DEFAULT = 5858;

@injectable()
export class NodeDebugAdapterContribution extends AbstractVSCodeDebugAdapterContribution {
    constructor() {
        super(
            'node',
            path.join(__dirname, '../../download/node-debug/extension')
        );
    }

    // TODO: construct based on package.json of the given workspace
    provideDebugConfigurations(workspaceFolderUri?: string): DebugConfiguration[] {
        return [{
            type: this.type,
            request: 'attach',
            name: 'Debug (Attach)',
            processId: ''
        }];
    }

    // TODO: align with vscode-node-debug
    async resolveDebugConfiguration(config: DebugConfiguration, workspaceFolderUri?: string): Promise<DebugConfiguration | undefined> {
        if (!config.cwd && !!workspaceFolderUri) {
            config.cwd = FileUri.fsPath(workspaceFolderUri);
        }
        if (!config.cwd) {
            config.cwd = '${workspaceFolder}';
        }
        if (config.request === 'attach' && typeof config.processId === 'string') {
            await this.resolveAttachConfiguration(config);
        }
        config.type = await this.resolveDebugType(config);
        return config;
    }

    protected async resolveDebugType(config: DebugConfiguration): Promise<string> {
        if (config.protocol === 'legacy') {
            return 'node';
        }
        if (config.protocol === 'inspector') {
            return 'node2';
        }
        // TODO: auto detect
        return 'node2';
    }

    // TODO: align with vscode-node-debug
    protected async resolveAttachConfiguration(config: DebugConfiguration): Promise<void> {
        config.protocol = 'inspector';
        config.port = 9229;

        const pidToDebug = Number.parseInt(config.processId);

        const tasks = await psList();
        const taskToDebug = tasks.find(task => task.pid === pidToDebug);
        if (taskToDebug) {
            const matches = /--(inspect|debug)-port=(\d+)/.exec(taskToDebug.cmd);
            if (matches && matches.length === 3) {
                config.port = parseInt(matches[2]);
                config.protocol = matches[1] === 'debug' ? 'legacy' : 'inspector';
            }
        }

        delete config.processId;
    }
}

@injectable()
export class Node2DebugAdapterContribution extends AbstractVSCodeDebugAdapterContribution {
    constructor() {
        super(
            'node2',
            path.join(__dirname, '../../download/node-debug2/extension')
        );
    }
}
