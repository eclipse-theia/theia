// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { HostedPluginClient } from '../../common/plugin-protocol';
import { LogPart } from '../../common/types';

@injectable()
export class HostedPluginWatcher {
    private onPostMessage = new Emitter<{ pluginHostId: string, message: Uint8Array }>();

    private onLogMessage = new Emitter<LogPart>();

    private readonly onDidDeployEmitter = new Emitter<void>();
    readonly onDidDeploy = this.onDidDeployEmitter.event;

    getHostedPluginClient(): HostedPluginClient {
        const messageEmitter = this.onPostMessage;
        const logEmitter = this.onLogMessage;
        return {
            postMessage(pluginHostId, message: Uint8Array): Promise<void> {
                messageEmitter.fire({ pluginHostId, message });
                return Promise.resolve();
            },
            log(logPart: LogPart): Promise<void> {
                logEmitter.fire(logPart);
                return Promise.resolve();
            },
            onDidDeploy: () => this.onDidDeployEmitter.fire(undefined)
        };
    }

    get onPostMessageEvent(): Event<{ pluginHostId: string, message: Uint8Array }> {
        return this.onPostMessage.event;
    }

    get onLogMessageEvent(): Event<LogPart> {
        return this.onLogMessage.event;
    }
}
