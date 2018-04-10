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
