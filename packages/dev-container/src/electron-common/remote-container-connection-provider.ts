// *****************************************************************************
// Copyright (C) 2024 Typefox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

import { RpcServer } from '@theia/core';
import { ContainerOutputProvider } from './container-output-provider';
import type { ContainerInspectInfo } from 'dockerode';

// *****************************************************************************
export const RemoteContainerConnectionProviderPath = '/remote/container';

export const RemoteContainerConnectionProvider = Symbol('RemoteContainerConnectionProvider');

export interface ContainerConnectionOptions {
    nodeDownloadTemplate?: string;
    lastContainerInfo?: LastContainerInfo
    devcontainerFile: string;
}

export interface LastContainerInfo {
    id: string;
    lastUsed: number;
}

export interface ContainerConnectionResult {
    port: string;
    workspacePath: string;
    containerId: string;
}

export interface DevContainerFile {
    name: string;
    path: string;
}

export interface RemoteContainerConnectionProvider extends RpcServer<ContainerOutputProvider> {
    connectToContainer(options: ContainerConnectionOptions): Promise<ContainerConnectionResult>;
    getDevContainerFiles(): Promise<DevContainerFile[]>;
    getCurrentContainerInfo(port: number): Promise<ContainerInspectInfo | undefined>;
}
