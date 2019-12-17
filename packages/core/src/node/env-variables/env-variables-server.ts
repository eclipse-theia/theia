/********************************************************************************
 * Copyright (C) 2018-2019 Red Hat, Inc. and others.
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

import * as path from 'path';
import * as os from 'os';
import { injectable } from 'inversify';
import { EnvVariable, EnvVariablesServer } from '../../common/env-variables';
import { isWindows } from '../../common/os';

const THEIA_DATA_FOLDER = '.theia';

const WINDOWS_APP_DATA_DIR = 'AppData';
const WINDOWS_ROAMING_DIR = 'Roaming';
const WINDOWS_DATA_FOLDERS = [WINDOWS_APP_DATA_DIR, WINDOWS_ROAMING_DIR];

@injectable()
export class EnvVariablesServerImpl implements EnvVariablesServer {

    protected readonly envs: { [key: string]: EnvVariable } = {};

    constructor() {
        const prEnv = process.env;
        Object.keys(prEnv).forEach((key: string) => {
            this.envs[key] = { 'name': key, 'value': prEnv[key] };
        });
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

    async getUserHomeFolderPath(): Promise<string> {
        return os.homedir();
    }

    async getDataFolderName(): Promise<string> {
        return THEIA_DATA_FOLDER;
    }

    async getUserDataFolderPath(): Promise<string> {
        return path.join(os.homedir(), THEIA_DATA_FOLDER);
    }

    async getAppDataPath(): Promise<string> {
        return path.join(
            os.homedir(),
            ...(isWindows ? WINDOWS_DATA_FOLDERS : ['']),
            THEIA_DATA_FOLDER
        );
    }
}
