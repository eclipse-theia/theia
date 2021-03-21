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

export const envVariablesPath = '/services/envs';

export const EnvVariablesServer = Symbol('EnvVariablesServer');
export interface EnvVariablesServer {
    getExecPath(): Promise<string>
    getVariables(): Promise<EnvVariable[]>
    getValue(key: string): Promise<EnvVariable | undefined>
    getConfigDirUri(): Promise<string>;
    /**
     * Resolves to a URI representing the current user's home directory.
     */
    getHomeDirUri(): Promise<string>;
    /**
     * Resolves to an array of URIs pointing to the available drives on the filesystem.
     */
    getDrives(): Promise<string[]>;
}

export interface EnvVariable {
    readonly name: string
    readonly value: string | undefined
}
