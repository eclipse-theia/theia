/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import * as rt from '../common/remote-terminal-protocol';
import * as srt from '../common/shell-terminal-protocol';
import { VariableCollectionsService } from './environment-collections-service';

@injectable()
export class ShellRemoteTerminalServerImpl implements srt.ShellRemoteTerminalServer {

    @inject(rt.RemoteTerminalServer)
    protected remoteTerminalServer: rt.RemoteTerminalServer;

    @inject(VariableCollectionsService)
    protected variableCollections: VariableCollectionsService;

    async spawn(id: rt.RemoteTerminalConnectionId, options: {}): Promise<rt.RemoteTerminalSpawnResponse> {
        const env = mergeProcessEnv({});
        this.variableCollections.mergedCollection.applyToProcessEnvironment(env);
        return this.remoteTerminalServer.spawn(id, {
            executable: 'bash',
            env
        });
    }

    async attach(id: rt.RemoteTerminalConnectionId, options: {}): Promise<rt.RemoteTerminalAttachResponse> {
        return this.remoteTerminalServer.attach(id, {
            terminalId: -1
        });
    }
}

/**
 * Merges a given record of environment variables with the process environment variables.
 * Empty string values will not be included in the final env.
 * @param env desired environment to merge with `process.env`.
 *
 * @returns a merged record of valid environment variables.
 */
export function mergeProcessEnv(env: Record<string, string | null> = {}): Record<string, string> {
    // eslint-disable-next-line no-null/no-null
    const mergedEnv: Record<string, string> = Object.create(null);
    for (const [key, value] of Object.entries(process.env)) {
        // Ignore keys from `process.env` that are overridden in `env`. Accept only non-empty strings.
        if (!(key in env) && value) { mergedEnv[key] = value; }
    }
    for (const [key, value] of Object.entries(env)) {
        // Accept only non-empty strings from the `env` object.
        if (value) { mergedEnv[key] = value; }
    }
    return mergedEnv;
}
