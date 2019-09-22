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

import { UUID } from '@phosphor/coreutils';
import { injectable } from 'inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { HostedPluginClient } from '../../common/plugin-protocol';
import { LogPart } from '../../common/types';
import { Deferred } from '@theia/core/lib/common/promise-util';

@injectable()
export class HostedPluginWatcher {
    private onPostMessage = new Emitter<string[]>();
    private onLogMessage = new Emitter<LogPart>();

    private readonly onDidDeployEmitter = new Emitter<void>();
    readonly onDidDeploy = this.onDidDeployEmitter.event;

    readonly clientId = UUID.uuid4();

    protected _initialized = new Deferred<void>();
    get initialized(): Promise<void> {
        return this._initialized.promise;
    }

    reset(): void {
        this._initialized = new Deferred<void>();
    }

    getHostedPluginClient(): HostedPluginClient {
        const messageEmitter = this.onPostMessage;
        const logEmitter = this.onLogMessage;
        return {
            initialize: async () => {
                this._initialized.resolve();
                return { clientId: this.clientId };
            },
            postMessage(message: string): Promise<void> {
                messageEmitter.fire(JSON.parse(message));
                return Promise.resolve();
            },
            log(logPart: LogPart): Promise<void> {
                logEmitter.fire(logPart);
                return Promise.resolve();
            },
            onDidDeploy: () => this.onDidDeployEmitter.fire(undefined)
        };
    }

    get onPostMessageEvent(): Event<string[]> {
        return this.onPostMessage.event;
    }

    get onLogMessageEvent(): Event<LogPart> {
        return this.onLogMessage.event;
    }
}
