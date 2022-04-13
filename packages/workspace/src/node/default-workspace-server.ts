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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as path from 'path';
import * as yargs from '@theia/core/shared/yargs';
import * as fs from '@theia/core/shared/fs-extra';
import * as jsoncparser from 'jsonc-parser';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { FileUri, BackendApplicationContribution } from '@theia/core/lib/node';
import { CliContribution } from '@theia/core/lib/node/cli';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { WorkspaceServer, CommonWorkspaceUtils } from '../common';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class WorkspaceCliContribution implements CliContribution {

    workspaceRoot = new Deferred<string | undefined>();

    configure(conf: yargs.Argv): void {
        conf.usage('$0 [workspace-directory] [options]');
        conf.option('root-dir', {
            description: 'DEPRECATED: Sets the workspace directory.',
        });
    }

    setArguments(args: yargs.Arguments): void {
        let wsPath: string | undefined = typeof args._[2] === 'undefined' ? undefined : String(args._[2]);
        if (!wsPath) {
            wsPath = args['root-dir'] as string;
            if (!wsPath) {
                this.workspaceRoot.resolve(undefined);
                return;
            }
        }
        if (!path.isAbsolute(wsPath)) {
            const cwd = process.cwd();
            wsPath = path.join(cwd, wsPath);
        }
        if (wsPath && wsPath.endsWith('/')) {
            wsPath = wsPath.slice(0, -1);
        }
        this.workspaceRoot.resolve(wsPath);
    }
}

@injectable()
export class DefaultWorkspaceServer implements WorkspaceServer, BackendApplicationContribution {

    protected root: Deferred<string | undefined> = new Deferred();
    /**
     * Untitled workspaces that are not among the most recent N workspaces will be deleted on start. Increase this number to keep older files,
     * lower it to delete stale untitled workspaces more aggressively.
     */
    protected untitledWorkspaceStaleThreshhold = 10;

    @inject(WorkspaceCliContribution)
    protected readonly cliParams: WorkspaceCliContribution;

    @inject(EnvVariablesServer)
    protected readonly envServer: EnvVariablesServer;

    @inject(CommonWorkspaceUtils)
    protected readonly utils: CommonWorkspaceUtils;

    @postConstruct()
    protected async init(): Promise<void> {
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
        const listUri: string[] = [];
        const data = await this.readRecentWorkspacePathsFromUserHome();
        if (data && data.recentRoots) {
            data.recentRoots.forEach(element => {
                if (element.length > 0) {
                    if (this.workspaceStillExist(element)) {
                        listUri.push(element);
                    }
                }
            });
        }
        return listUri;
    }

    protected workspaceStillExist(workspaceRootUri: string): boolean {
        return fs.pathExistsSync(FileUri.fsPath(workspaceRootUri));
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
     * Use the `untitledWorkspaceStaleThreshhold` to configure when to delete workspaces.
     */
    protected async removeOldUntitledWorkspaces(): Promise<void> {
        const recents = (await this.getRecentWorkspaces()).map(FileUri.fsPath);
        const olderUntitledWorkspaces = recents.slice(this.untitledWorkspaceStaleThreshhold).filter(workspace => this.utils.isUntitledWorkspace(FileUri.create(workspace)));
        await Promise.all(olderUntitledWorkspaces.map(workspace => fs.promises.unlink(FileUri.fsPath(workspace)).catch(() => { })));
        if (olderUntitledWorkspaces.length > 0) {
            await this.writeToUserHome({ recentRoots: await this.getRecentWorkspaces() });
        }
    }
}

interface RecentWorkspacePathsData {
    recentRoots: string[];
}

namespace RecentWorkspacePathsData {
    /**
     * Parses `data` as `RecentWorkspacePathsData` but removes any non-string array entry.
     *
     * Returns undefined if the given `data` does not contain a `recentRoots` array property.
     */
    export function create(data: Object | undefined): RecentWorkspacePathsData | undefined {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-null/no-null
        if (typeof data !== 'object' || data === null || !Array.isArray((data as any)['recentRoots'])) {
            return;
        }
        return {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            recentRoots: (data as any)['recentRoots'].filter((root: unknown) => typeof root === 'string')
        };
    }
}
