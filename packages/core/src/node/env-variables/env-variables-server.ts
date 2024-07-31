// *****************************************************************************
// Copyright (C) 2018-2020 Red Hat, Inc. and others.
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

import { join } from 'path';
import { homedir } from 'os';
import { injectable } from 'inversify';
import * as drivelist from 'drivelist';
import { pathExists, mkdir } from 'fs-extra';
import { EnvVariable, EnvVariablesServer } from '../../common/env-variables';
import { isWindows } from '../../common/os';
import { FileUri } from '../../common/file-uri';
import { BackendApplicationPath } from '../backend-application';

@injectable()
export class EnvVariablesServerImpl implements EnvVariablesServer {

    protected readonly envs: { [key: string]: EnvVariable } = {};
    protected readonly homeDirUri = FileUri.create(homedir()).toString();
    protected readonly configDirUri: Promise<string>;
    protected readonly pathExistenceCache: { [key: string]: boolean } = {};

    constructor() {
        this.configDirUri = this.createConfigDirUri();
        this.configDirUri.then(configDirUri => console.log(`Configuration directory URI: '${configDirUri}'`));
        const prEnv = process.env;
        Object.keys(prEnv).forEach((key: string) => {
            let keyName = key;
            if (isWindows) {
                keyName = key.toLowerCase();
            }
            this.envs[keyName] = { 'name': keyName, 'value': prEnv[key] };
        });
    }

    protected async createConfigDirUri(): Promise<string> {
        if (process.env.THEIA_CONFIG_DIR) {
            // this has been explicitly set by the user, so we do not override its value
            return FileUri.create(process.env.THEIA_CONFIG_DIR).toString();
        }

        const dataFolderPath = join(BackendApplicationPath, 'data');
        const userDataPath = join(dataFolderPath, 'user-data');
        const dataFolderExists = this.pathExistenceCache[dataFolderPath] ??= await pathExists(dataFolderPath);
        if (dataFolderExists) {
            const userDataExists = this.pathExistenceCache[userDataPath] ??= await pathExists(userDataPath);
            if (userDataExists) {
                process.env.THEIA_CONFIG_DIR = userDataPath;
            } else {
                await mkdir(userDataPath);
                process.env.THEIA_CONFIG_DIR = userDataPath;
                this.pathExistenceCache[userDataPath] = true;
            }
        } else {
            process.env.THEIA_CONFIG_DIR = join(homedir(), '.theia');
        }
        return FileUri.create(process.env.THEIA_CONFIG_DIR).toString();
    }

    async getExecPath(): Promise<string> {
        return process.execPath;
    }

    async getVariables(): Promise<EnvVariable[]> {
        return Object.keys(this.envs).map(key => this.envs[key]);
    }

    async getValue(key: string): Promise<EnvVariable | undefined> {
        if (isWindows) {
            key = key.toLowerCase();
        }
        return this.envs[key];
    }

    getConfigDirUri(): Promise<string> {
        return this.configDirUri;
    }

    async getHomeDirUri(): Promise<string> {
        return this.homeDirUri;
    }

    async getDrives(): Promise<string[]> {
        const uris: string[] = [];
        const drives = await drivelist.list();
        for (const drive of drives) {
            for (const mountpoint of drive.mountpoints) {
                if (this.filterHiddenPartitions(mountpoint.path)) {
                    uris.push(FileUri.create(mountpoint.path).toString());
                }
            }
        }
        return uris;
    }

    /**
     * Filters hidden and system partitions.
     */
    protected filterHiddenPartitions(path: string): boolean {
        // OS X: This is your sleep-image. When your Mac goes to sleep it writes the contents of its memory to the hard disk. (https://bit.ly/2R6cztl)
        if (path === '/private/var/vm') {
            return false;
        }
        // Ubuntu: This system partition is simply the boot partition created when the computers mother board runs UEFI rather than BIOS. (https://bit.ly/2N5duHr)
        if (path === '/boot/efi') {
            return false;
        }
        return true;
    }

}
