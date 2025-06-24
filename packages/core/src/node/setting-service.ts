// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import { EnvVariablesServer } from '../common/env-variables';
import { Deferred } from '../common/promise-util';
import { promises as fs } from 'fs';
import { URI } from '../common';

export const SettingService = Symbol('SettingService');

/**
 * A service providing a simple user-level, persistent key-value store on the back end
 */
export interface SettingService {
    set(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | undefined>;
}

@injectable()
export class SettingServiceImpl implements SettingService {

    @inject(EnvVariablesServer)
    protected readonly envVarServer: EnvVariablesServer;

    protected readonly ready = new Deferred<void>();
    protected values: Record<string, string> = {};

    @postConstruct()
    protected init(): void {
        const asyncInit = async () => {
            const configDir = new URI(await this.envVarServer.getConfigDirUri());
            const path: string = configDir.resolve('backend-settings.json').path.fsPath();
            try {
                const contents = await fs.readFile(path, {
                    encoding: 'utf-8'
                });
                this.values = JSON.parse(contents);
            } catch (e) {
                console.log(e);
            } finally {
                this.ready.resolve();
            }
        };
        asyncInit();
    }

    async set(key: string, value: string): Promise<void> {
        await this.ready.promise;
        this.values[key] = value;
        await this.writeFile();
    }

    async writeFile(): Promise<void> {
        const configDir = new URI(await this.envVarServer.getConfigDirUri());
        const path: string = configDir.resolve('backend-settings.json').path.fsPath();
        const values = JSON.stringify(this.values);
        await fs.writeFile(path, values);
    }

    async get(key: string): Promise<string | undefined> {
        await this.ready.promise;
        return this.values[key];
    }
}
