// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
// *****************************************************************************

import * as SshConfig from 'ssh-config';

export const RemoteSSHConnectionProviderPath = '/remote/ssh';

export const RemoteSSHConnectionProvider = Symbol('RemoteSSHConnectionProvider');

export interface RemoteSSHConnectionProviderOptions {
    user: string;
    host: string;
    nodeDownloadTemplate?: string;
    customConfigFile?: string;
}

export interface SSHConfig extends Array<SshConfig.Line> {
    compute(opts: string | SshConfig.MatchOptions): Record<string, string | string[]>;
}

export interface RemoteSSHConnectionProvider {
    establishConnection(options: RemoteSSHConnectionProviderOptions): Promise<string>;
    getSSHConfig(customConfigFile?: string): Promise<SSHConfig>;
    matchSSHConfigHost(host: string, user?: string, customConfigFile?: string): Promise<Record<string, string | string[]> | undefined>;
}
