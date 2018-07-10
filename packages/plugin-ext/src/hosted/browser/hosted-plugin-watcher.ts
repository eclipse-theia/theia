/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable } from "inversify";
import { Emitter, Event } from '@theia/core/lib/common/event';
import { HostedPluginClient } from "../../common/plugin-protocol";

@injectable()
export class HostedPluginWatcher {
    private onPostMessage = new Emitter<string[]>();
    getHostedPluginClient(): HostedPluginClient {
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
