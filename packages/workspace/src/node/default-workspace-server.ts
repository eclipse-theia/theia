// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import * as path from 'path';
import * as yargs from '@theia/core/shared/yargs';
import * as fs from '@theia/core/shared/fs-extra';
import * as jsoncparser from 'jsonc-parser';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { FileUri, BackendApplicationContribution } from '@theia/core/lib/node';
import { CliContribution } from '@theia/core/lib/node/cli';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { WorkspaceServer, UntitledWorkspaceService } from '../common';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import URI from '@theia/core/lib/common/uri';
import { notEmpty } from '@theia/core';

@injectable()
export class WorkspaceCliContribution implements CliContribution {

    @inject(EnvVariablesServer) protected readonly envVariablesServer: EnvVariablesServer;
    @inject(UntitledWorkspaceService) protected readonly untitledWorkspaceService: UntitledWorkspaceService;

    workspaceRoot = new Deferred<string | undefined>();

    configure(conf: yargs.Argv): void {
        conf.usage('$0 [workspace-directories] [options]');
        conf.option('root-dir', {
            description: 'DEPRECATED: Sets the workspace directory.',
        });
    }

    async setArguments(args: yargs.Arguments): Promise<void> {
        const workspaceArguments = args._.map(probablyAlreadyString => String(probablyAlreadyString));
        if (workspaceArguments.length === 0 && args['root-dir']) {
            workspaceArguments.push(String(args['root-dir']));
        }
        if (workspaceArguments.length === 0) {
            this.workspaceRoot.resolve(undefined);
        } else if (workspaceArguments.length === 1) {
            this.workspaceRoot.resolve(this.normalizeWorkspaceArg(workspaceArguments[0]));
        } else {
            this.workspaceRoot.resolve(this.buildWorkspaceForMultipleArguments(workspaceArguments));
        }
    }

    protected normalizeWorkspaceArg(raw: string): string {
        return path.resolve(raw).replace(/\/$/, '');
    }

    protected async buildWorkspaceForMultipleArguments(workspaceArguments: string[]): Promise<string | undefined> {
        try {
            const dirs = await Promise.all(workspaceArguments.map(async maybeDir => (await fs.stat(maybeDir).catch(() => undefined))?.isDirectory()));
            const folders = workspaceArguments.filter((_, index) => dirs[index]).map(dir => ({ path: this.normalizeWorkspaceArg(dir) }));
            if (folders.length < 2) {
                return folders[0]?.path;
            }
            const untitledWorkspaceUri = await this.untitledWorkspaceService.getUntitledWorkspaceUri(
                new URI(await this.envVariablesServer.getConfigDirUri()),
                async uri => !await fs.pathExists(uri.path.fsPath()),
            );
            const untitledWorkspacePath = untitledWorkspaceUri.path.fsPath();

            await fs.ensureDir(path.dirname(untitledWorkspacePath));
            await fs.writeFile(untitledWorkspacePath, JSON.stringify({ folders }, undefined, 4));
            return untitledWorkspacePath;
        } catch {
            return undefined;
        }
    }
}

@injectable()
export class DefaultWorkspaceServer implements WorkspaceServer, BackendApplicationContribution {

    protected root: Deferred<string | undefined> = new Deferred();
    /**
     * Untitled workspaces that are not among the most recent N workspaces will be deleted on start. Increase this number to keep older files,
     * lower it to delete stale untitled workspaces more aggressively.
     */
    protected untitledWorkspaceStaleThreshold = 10;

    @inject(WorkspaceCliContribution)
    protected readonly cliParams: WorkspaceCliContribution;

    @inject(EnvVariablesServer)
    protected readonly envServer: EnvVariablesServer;

    @inject(UntitledWorkspaceService)
    protected readonly untitledWorkspaceService: UntitledWorkspaceService;

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        const root = await this.getRoot();
        this.root.resolve(root);
    }

    async onStart(): Promise<void> {
        await this.removeOldUntitledWorkspaces();
    }

    protected async getRoot(): Promise<string | undefined> {
        let root = await this.getWorkspaceURIFromCli();
        if (!root) {
            const data = await this.readRecentWorkspacePathsFromUserHome();
            if (data && data.recentRoots) {
                root = data.recentRoots[0];
            }
        }
        return root;
    }

    getMostRecentlyUsedWorkspace(): Promise<string | undefined> {
        return this.root.promise;
    }

    async setMostRecentlyUsedWorkspace(rawUri: string): Promise<void> {
        const uri = rawUri && new URI(rawUri).toString(); // the empty string is used as a signal from the frontend not to load a workspace.
        this.root = new Deferred();
        this.root.resolve(uri);
        const recentRoots = Array.from(new Set([uri, ...await this.getRecentWorkspaces()]));
        this.writeToUserHome({ recentRoots });
    }

    async removeRecentWorkspace(rawUri: string): Promise<void> {
        const uri = rawUri && new URI(rawUri).toString(); // the empty string is used as a signal from the frontend not to load a workspace.
        const recentRoots = await this.getRecentWorkspaces();
        const index = recentRoots.indexOf(uri);
        if (index !== -1) {
            recentRoots.splice(index, 1);
            this.writeToUserHome({
                recentRoots
            });
        }
    }

    async getRecentWorkspaces(): Promise<string[]> {
        const data = await this.readRecentWorkspacePathsFromUserHome();
        if (data && data.recentRoots) {
            const allRootUris = await Promise.all(data.recentRoots.map(async element =>
                element && await this.workspaceStillExist(element) ? element : undefined));
            return allRootUris.filter(notEmpty);
        }
        return [];
    }

    protected async workspaceStillExist(workspaceRootUri: string): Promise<boolean> {
        const uri = new URI(workspaceRootUri);
        // Non file system workspaces cannot be checked for existence
        if (uri.scheme !== 'file') {
            return false;
        }
        return fs.pathExists(uri.path.fsPath());
    }

    protected async getWorkspaceURIFromCli(): Promise<string | undefined> {
        const arg = await this.cliParams.workspaceRoot.promise;
        return arg !== undefined ? FileUri.create(arg).toString() : undefined;
    }

    /**
     * Writes the given uri as the most recently used workspace root to the user's home directory.
     * @param uri most recently used uri
     */
    protected async writeToUserHome(data: RecentWorkspacePathsData): Promise<void> {
        const file = await this.getUserStoragePath();
        await this.writeToFile(file, data);
    }

    protected async writeToFile(fsPath: string, data: object): Promise<void> {
        if (!await fs.pathExists(fsPath)) {
            await fs.mkdirs(path.resolve(fsPath, '..'));
        }
        await fs.writeJson(fsPath, data);
    }

    /**
     * Reads the most recently used workspace root from the user's home directory.
     */
    protected async readRecentWorkspacePathsFromUserHome(): Promise<RecentWorkspacePathsData | undefined> {
        const fsPath = await this.getUserStoragePath();
        const data = await this.readJsonFromFile(fsPath);
        return RecentWorkspacePathsData.create(data);
    }

    protected async readJsonFromFile(fsPath: string): Promise<object | undefined> {
        if (await fs.pathExists(fsPath)) {
            const rawContent = await fs.readFile(fsPath, 'utf-8');
            const strippedContent = jsoncparser.stripComments(rawContent);
            return jsoncparser.parse(strippedContent);
        }
    }

    protected async getUserStoragePath(): Promise<string> {
        const configDirUri = await this.envServer.getConfigDirUri();
        return path.resolve(FileUri.fsPath(configDirUri), 'recentworkspace.json');
    }

    /**
     * Removes untitled workspaces that are not among the most recently used workspaces.
     * Use the `untitledWorkspaceStaleThreshold` to configure when to delete workspaces.
     */
    protected async removeOldUntitledWorkspaces(): Promise<void> {
        const recents = (await this.getRecentWorkspaces()).map(FileUri.fsPath);
        const olderUntitledWorkspaces = recents
            .slice(this.untitledWorkspaceStaleThreshold)
            .filter(workspace => this.untitledWorkspaceService.isUntitledWorkspace(FileUri.create(workspace)));
        await Promise.all(olderUntitledWorkspaces.map(workspace => fs.promises.unlink(FileUri.fsPath(workspace)).catch(() => { })));
        if (olderUntitledWorkspaces.length > 0) {
            await this.writeToUserHome({ recentRoots: await this.getRecentWorkspaces() });
        }
    }
}

export interface RecentWorkspacePathsData {
    recentRoots: string[];
}

export namespace RecentWorkspacePathsData {
    /**
     * Parses `data` as `RecentWorkspacePathsData` but removes any non-string array entry.
     *
     * Returns undefined if the given `data` does not contain a `recentRoots` array property.
     */
    export function create(data: unknown): RecentWorkspacePathsData | undefined {
        if (typeof data !== 'object' || !data || !Array.isArray((data as RecentWorkspacePathsData).recentRoots)) {
            return;
        }
        return {
            recentRoots: (data as RecentWorkspacePathsData).recentRoots.filter(root => typeof root === 'string')
        };
    }
}
