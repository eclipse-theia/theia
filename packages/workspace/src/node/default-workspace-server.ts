/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import * as yargs from 'yargs';
import * as fs from 'fs-extra';
import * as os from 'os';

import { injectable, inject, postConstruct } from 'inversify';
import { FileUri } from '@theia/core/lib/node';
import { CliContribution } from '@theia/core/lib/node/cli';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { WorkspaceServer, WorkspaceData, WorkspaceSettings } from '../common';

const DEFAULT_WORKSPACE_CONFIG_FILE = 'recentworkspace.json';

@injectable()
export class WorkspaceCliContribution implements CliContribution {

    workspaceRoot = new Deferred<string | undefined>();

    configure(conf: yargs.Argv): void {
        conf.usage("$0 [workspace-directory] [options]");
        conf.option('root-dir', {
            description: 'DEPRECATED: Sets the workspace directory.',
        });
    }

    setArguments(args: yargs.Arguments): void {
        let wsPath = args._[2];
        if (!wsPath) {
            wsPath = args['root-dir'];
            if (!wsPath) {
                this.workspaceRoot.resolve();
                return;
            }
        }
        if (!path.isAbsolute(wsPath)) {
            const cwd = process.cwd();
            wsPath = path.join(cwd, wsPath);
        }
        this.workspaceRoot.resolve(wsPath);
    }
}

@injectable()
export class DefaultWorkspaceServer implements WorkspaceServer {

    private _workspaceConfigMap: WorkspaceConfigDataMap = {};
    private readonly deferredWsConfigMap = new Deferred<WorkspaceConfigDataMap>();

    @inject(WorkspaceCliContribution)
    protected readonly cliParams: WorkspaceCliContribution;

    @postConstruct()
    protected async init() {
        this.getRootURIFromCli().then(async root => {
            if (!root) {
                this._workspaceConfigMap = await this.getWorkspaceConfigMap();
                this.deferredWsConfigMap.resolve(this._workspaceConfigMap);
            }
        });
    }

    async getDefaultWorkspaceInstanceId(): Promise<string | undefined> {
        const configData = await this.readConfigFromFile(this.getDefaultWorkspaceConfigFilePath());
        if (configData) {
            return configData.id;
        }
    }

    getActiveRoot(instanceId: string | undefined): Promise<string | undefined> {
        return this.deferredWsConfigMap.promise
            .then(map => map && instanceId && map[instanceId] ? map[instanceId].activeRoot : undefined);
    }

    setActiveRoot(uri: string, instanceId: string): Promise<void> { // TODO resolve the race condition problem: setActiveRoot can be called after the update function is called
        let config = this._workspaceConfigMap[instanceId];
        if (!config) {
            this._workspaceConfigMap[instanceId] = {
                id: instanceId,
                activeRoot: '',
                roots: [],
                settings: {}
            };
            config = this._workspaceConfigMap[instanceId];
        }

        config.activeRoot = uri;

        if (uri === '') { // on workspace close
            config.roots = [];
        } else if (config.roots.indexOf(uri) < 0) {
            config.roots.push(uri);
        }

        return this.writeToUserHome({
            id: instanceId,
            activeRoot: uri,
            roots: config.roots,
            settings: config.settings
        }).then(() =>
            this.deferredWsConfigMap.resolve(this._workspaceConfigMap)
        );
    }

    getRoots(instanceId: string): Promise<string[]> {
        return Promise.resolve(this._workspaceConfigMap[instanceId] ? this._workspaceConfigMap[instanceId].roots : []);
    }

    addRoot(uri: string, instanceId: string): Promise<void> {
        const config = this._workspaceConfigMap[instanceId];
        if (config) {
            if (config.roots.indexOf(uri) < 0) {
                config.roots.push(uri);
            }
            return this.writeToUserHome({
                id: instanceId,
                activeRoot: config.activeRoot || '',
                roots: config.roots,
                settings: config.settings
            }).then(() =>
                this.deferredWsConfigMap.resolve(this._workspaceConfigMap)
            );
        } else {
            return Promise.resolve();
        }
    }

    async removeRoot(uri: string, instanceId: string): Promise<void> {
        const config = this._workspaceConfigMap[instanceId];
        if (config) {
            config.roots = config.roots.filter(root => root !== uri);
            if (config.activeRoot === uri) {
                config.activeRoot = config.roots[0];
            }
            return this.writeToUserHome({
                id: instanceId,
                activeRoot: config.activeRoot || '',
                roots: config.roots,
                settings: config.settings
            }).then(() =>
                this.deferredWsConfigMap.resolve(this._workspaceConfigMap)
            );
        } else {
            return Promise.resolve();
        }
    }

    async getWorkspaceConfigFile(instanceId: string): Promise<string | undefined> {
        const file = this.getWorkspaceConfigFilePath(instanceId);
        if (await fs.pathExists(file)) {
            return Promise.resolve(`file://${file}`);
        }
        return Promise.resolve(undefined);
    }

    async saveWorkspaceConfigAs(instanceId: string, newConfigFile: string): Promise<void> {
        const config = this._workspaceConfigMap[instanceId];
        if (config) {
            await this.writeWorkSpaceConfigData(newConfigFile, config);
        }
    }

    async loadWorkspaceFromConfig(configFilePath: string): Promise<WorkspaceData | undefined> {
        const configData = await this.readConfigFromFile(configFilePath);
        if (configData) {
            this._workspaceConfigMap[configData.id] = configData;
            this.deferredWsConfigMap.resolve(this._workspaceConfigMap);
            await this.writeToUserHome(configData);
            return configData;
        }
    }

    protected async getRootURIFromCli(): Promise<string | undefined> {
        const arg = await this.cliParams.workspaceRoot.promise;
        return arg !== undefined ? FileUri.create(arg).toString() : undefined;
    }

    /**
     * Writes the given uri as the most recently used workspace root to the user's home directory.
     * @param uri most recently used uri
     * @param instanceId uuid of the workspace
     */
    private writeToUserHome(data: WorkspaceData): Promise<void> {
        const defaultConfigFile = this.getDefaultWorkspaceConfigFilePath();
        const wsSpecificConfigFile = this.getWorkspaceConfigFilePath(data.id);
        return Promise.all([
            this.writeWorkSpaceConfigData(defaultConfigFile, data),
            this.writeWorkSpaceConfigData(wsSpecificConfigFile, data)
        ]).then(() => undefined);
    }

    private async writeWorkSpaceConfigData(file: string, data: WorkspaceData): Promise<void> {
        if (!await fs.pathExists(file)) {
            await fs.mkdirs(path.resolve(file, '..'));
        }
        return fs.writeJson(file, data);
    }

    protected getDefaultWorkspaceConfigFilePath(): string {
        return path.resolve(os.homedir(), '.theia', DEFAULT_WORKSPACE_CONFIG_FILE);
    }

    protected getWorkspaceConfigFilePath(instanceId: string): string {
        return path.resolve(os.homedir(), '.theia', `workspace-${instanceId}.json`);
    }

    private getWorkspacePaths(): WorkspaceConfigFileMap {
        const basedir = path.resolve(os.homedir(), '.theia');
        // regex of "workspace-{uuidv4}.json"
        const fileNameRegex = /^workspace-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/gm;
        const configFileMap: WorkspaceConfigFileMap = {};
        fs.readdirSync(basedir)
            .filter(file => fileNameRegex.test(file)) // TODO use async version of readdir()
            .forEach(configFile => {
                const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gm;
                const wsId = uuidRegex.exec(configFile);
                if (wsId) {
                    configFileMap[wsId[0]] = this.getWorkspaceConfigFilePath(wsId[0]);
                }
            });
        return configFileMap;
    }

    private async getWorkspaceConfigMap(): Promise<WorkspaceConfigDataMap> {
        const configFileMap = this.getWorkspacePaths();
        const configMap: WorkspaceConfigDataMap = {};
        for (const wsId of Object.keys(configFileMap)) {
            const configData = await this.readConfigFromFile(configFileMap[wsId]);
            if (configData) {
                configMap[wsId] = configData;
            }
        }
        return configMap;
    }

    private async readConfigFromFile(configFilePath: string): Promise<WorkspaceData | undefined> {
        const config = await this.readContentFromFile(configFilePath);
        if (WorkspaceData.is(config)) {
            return config;
        }
    }

    private async readContentFromFile(filePath: string): Promise<object | undefined> {
        if (await fs.pathExists(filePath)) {
            return await fs.readJson(filePath);
        }
    }

    async getWorkspaceSettings(instanceId: string): Promise<WorkspaceSettings> {
        const config = (await this.deferredWsConfigMap.promise)[instanceId];
        if (config) {
            return config.settings;
        }
        return {};
    }

    async updateWorkspaceSettings(instanceId: string, workspaceSettings: WorkspaceSettings): Promise<void> {
        const config = this._workspaceConfigMap[instanceId];
        if (config) {
            config.settings = workspaceSettings;
            return this.writeToUserHome(config).then(() =>
                this.deferredWsConfigMap.resolve(this._workspaceConfigMap)
            );
        } else {
            return Promise.resolve();
        }
    }
}

interface WorkspaceConfigDataMap {
    [id: string]: WorkspaceData
}

interface WorkspaceConfigFileMap {
    [id: string]: string
}
