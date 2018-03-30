/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */
import { injectable } from "inversify";
import { Emitter, Event } from '@theia/core/lib/common/event';
import { HostedExtensionClient } from '../common/extension-protocol';

@injectable()
export class HostedExtensionWatcher {
    private onPostMessage = new Emitter<string[]>();
    getHostedExtensionClient(): HostedExtensionClient {
        const messageEmitter = this.onPostMessage;
        return {
            postMessage(message: string): Promise<void> {
                messageEmitter.fire(JSON.parse(message));
                return Promise.resolve();
            }
        };
    }

    get onPostMessageEvent(): Event<string[]> {
        return this.onPostMessage.event;
    }
}
