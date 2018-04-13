/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { JsonRpcServer } from '@theia/core/lib/common/messaging/proxy-factory';

export const hostedServicePath = '/services/hostedPlugin';

export interface Plugin {
    name: string;
    publisher: string;
    version: string;
    theiaPlugin: { worker?: string, node?: string };
}

export const HostedPluginClient = Symbol('HostedPluginClient');
export interface HostedPluginClient {
    postMessage(message: string): Promise<void>;
}

export const HostedPluginServer = Symbol('HostedPluginServer');
export interface HostedPluginServer extends JsonRpcServer<HostedPluginClient> {
    getHostedPlugin(): Promise<Plugin | undefined>;
    onMessage(message: string): Promise<void>;
}
