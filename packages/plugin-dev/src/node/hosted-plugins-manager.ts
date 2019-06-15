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

import { inject, injectable } from 'inversify';
import * as cp from 'child_process';
import * as fs from 'fs';
import { sep as PATH_SEPARATOR } from 'path';
import { HostedPluginSupport } from '@theia/plugin-ext/lib/hosted/node/hosted-plugin';
import { LogType } from '@theia/plugin-ext/lib/common/types';

export const HostedPluginsManager = Symbol('HostedPluginsManager');

export interface HostedPluginsManager {

    /**
     * Runs watcher script to recomple plugin on any changes along given path.
     *
     * @param uri uri to plugin root folder.
     */
    runWatchCompilation(uri: string): Promise<void>;

    /**
     * Stops watcher script.
     *
     * @param uri uri to plugin root folder.
     */
    stopWatchCompilation(uri: string): Promise<void>;

    /**
     * Chacks if watcher script to recomple plugin is running.
     *
     * @param uri uri to plugin root folder.
     */
    isWatchCompilationRunning(uri: string): Promise<boolean>;
}

@injectable()
export class HostedPluginsManagerImpl implements HostedPluginsManager {

    @inject(HostedPluginSupport)
    protected readonly hostedPluginSupport: HostedPluginSupport;

    protected watchCompilationRegistry: Map<string, cp.ChildProcess>;

    constructor() {
        this.watchCompilationRegistry = new Map();
    }

    runWatchCompilation(uri: string): Promise<void> {
        const pluginRootPath = this.getFsPath(uri);

        if (this.watchCompilationRegistry.has(pluginRootPath)) {
            throw new Error('Watcher is already running in ' + pluginRootPath);
        }

        if (!this.checkWatchScript(pluginRootPath)) {
            this.hostedPluginSupport.sendLog({
                data: 'Plugin in ' + uri + ' doesn\'t have watch script',
                type: LogType.Error
            });
            throw new Error('Watch script doesn\'t exist in ' + pluginRootPath + 'package.json');
        }

        return this.runWatchScript(pluginRootPath);
    }

    stopWatchCompilation(uri: string): Promise<void> {
        const pluginPath = this.getFsPath(uri);

        const watchProcess = this.watchCompilationRegistry.get(pluginPath);
        if (!watchProcess) {
            throw new Error('Watcher is not running in ' + pluginPath);
        }

        watchProcess.kill();
        return Promise.resolve();
    }

    isWatchCompilationRunning(uri: string): Promise<boolean> {
        const pluginPath = this.getFsPath(uri);

        return new Promise(resolve => resolve(this.watchCompilationRegistry.has(pluginPath)));
    }

    protected runWatchScript(path: string): Promise<void> {
        const watchProcess = cp.spawn('yarn', ['run', 'watch'], { cwd: path });
        watchProcess.on('exit', () => this.unregisterWatchScript(path));

        this.watchCompilationRegistry.set(path, watchProcess);
        this.hostedPluginSupport.sendLog({
            data: 'Compilation watcher has been started in ' + path,
            type: LogType.Info
        });
        return Promise.resolve();
    }

    protected unregisterWatchScript(path: string) {
        this.watchCompilationRegistry.delete(path);
        this.hostedPluginSupport.sendLog({
            data: 'Compilation watcher has been stopped in ' + path,
            type: LogType.Info
        });
    }

    /**
     * Checks whether watch script is present into package.json by given parent folder.
     *
     * @param pluginPath path to plugin's root directory
     */
    protected checkWatchScript(pluginPath: string): boolean {
        const pluginPackageJsonPath = pluginPath + 'package.json';
        if (fs.existsSync(pluginPackageJsonPath)) {
            const packageJson = require(pluginPackageJsonPath);
            const scripts = packageJson['scripts'];
            if (scripts && scripts['watch']) {
                return true;
            }
        }
        return false;
    }

    protected getFsPath(uri: string): string {
        if (!uri.startsWith('file')) {
            throw new Error('Plugin uri ' + uri + ' is not supported.');
        }

        const path = uri.substring(uri.indexOf('://') + 3);

        if (!path.endsWith(PATH_SEPARATOR)) {
            return path + PATH_SEPARATOR;
        }

        return path;
    }

}
