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

import { promises as fs } from 'fs';
import { inject, injectable, postConstruct } from 'inversify';
import { ILogger, URI } from '../common';
import { EnvVariablesServer } from '../common/env-variables';
import { Deferred } from '../common/promise-util';

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
    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(EnvVariablesServer)
    protected readonly envVarServer: EnvVariablesServer;

    protected readonly ready = new Deferred<void>();
    protected values: Record<string, string> = {};

    @postConstruct()
    protected init(): void {
        const asyncInit = async () => {
            const settingsFileUri = await this.getSettingsFileUri();
            const path = settingsFileUri.path.fsPath();
            try {
                const contents = await fs.readFile(path, 'utf8');
                this.values = JSON.parse(contents);
            } catch (e) {
                if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
                    this.logger.info(`Settings file not found at '${path}'. Falling back to defaults.`);
                } else {
                    this.logger.warn(`Failed to read settings file at '${path}'. Falling back to defaults.`, e);
                }
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

    protected async writeFile(): Promise<void> {
        const settingsFileUri = await this.getSettingsFileUri();
        const path = settingsFileUri.path.fsPath();
        const values = JSON.stringify(this.values);
        await fs.writeFile(path, values);
    }

    async get(key: string): Promise<string | undefined> {
        await this.ready.promise;
        return this.values[key];
    }

    protected async getConfigDirUri(): Promise<URI> {
        const uri = await this.envVarServer.getConfigDirUri();
        return new URI(uri);
    }

    protected async getSettingsFileUri(): Promise<URI> {
        const configDir = await this.getConfigDirUri();
        return configDir.resolve('backend-settings.json');
    }
}
