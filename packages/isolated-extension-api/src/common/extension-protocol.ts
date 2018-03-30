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

export const hostedServicePath = '/services/hostedExtension';

export interface Extension {
    name: string;
    publisher: string;
    version: string;
    theiaExtension: { worker?: string, node?: string };
}

export const HostedExtensionClient = Symbol('HostedExtensionClient');
export interface HostedExtensionClient {
    postMessage(message: string): Promise<void>;
}

export const HostedExtensionServer = Symbol('HostedExtensionServer');
export interface HostedExtensionServer extends JsonRpcServer<HostedExtensionClient> {
    getHostedExtension(): Promise<Extension | undefined>;
    onMessage(message: string): Promise<void>;
}
