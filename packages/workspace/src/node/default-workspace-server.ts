/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import * as yargs from 'yargs';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as jsoncparser from 'jsonc-parser';

import { injectable, inject, postConstruct } from 'inversify';
import { FileUri } from '@theia/core/lib/node';
import { CliContribution } from '@theia/core/lib/node/cli';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { WorkspaceServer } from '../common';

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
        if (wsPath && wsPath.endsWith('/')) {
            wsPath = wsPath.slice(0, -1);
        }
        this.workspaceRoot.resolve(wsPath);
    }
}

@injectable()
export class DefaultWorkspaceServer implements WorkspaceServer {

    protected root: Deferred<string | undefined> = new Deferred();

    @inject(WorkspaceCliContribution)
    protected readonly cliParams: WorkspaceCliContribution;

    @postConstruct()
    protected async init() {
        const root = await this.getRoot();
        this.root.resolve(root);
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

    async setMostRecentlyUsedWorkspace(uri: string): Promise<void> {
        this.root = new Deferred();
        const listUri: string[] = [];
        const oldListUri = await this.getRecentWorkspaces();
        listUri.push(uri);
        if (oldListUri) {
            oldListUri.forEach(element => {
                if (element !== uri && element.length > 0) {
                    listUri.push(element);
                }
            });
        }
        this.root.resolve(uri);
        this.writeToUserHome({
            recentRoots: listUri
        });
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

    protected workspaceStillExist(wspath: string): boolean {
        return fs.pathExistsSync(FileUri.fsPath(wspath));
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
        const file = this.getUserStoragePath();
        await this.writeToFile(file, data);
    }

    protected async writeToFile(filePath: string, data: object): Promise<void> {
        if (!await fs.pathExists(filePath)) {
            await fs.mkdirs(path.resolve(filePath, '..'));
        }
        await fs.writeJson(filePath, data);
    }

    /**
     * Reads the most recently used workspace root from the user's home directory.
     */
    protected async readRecentWorkspacePathsFromUserHome(): Promise<RecentWorkspacePathsData | undefined> {
        const filePath = this.getUserStoragePath();
        const data = await this.readJsonFromFile(filePath);
        return RecentWorkspacePathsData.is(data) ? data : undefined;
    }

    protected async readJsonFromFile(filePath: string): Promise<object | undefined> {
        if (await fs.pathExists(filePath)) {
            const rawContent = await fs.readFile(filePath, 'utf-8');
            const strippedContent = jsoncparser.stripComments(rawContent);
            return jsoncparser.parse(strippedContent);
        }
    }

    protected getUserStoragePath(): string {
        return path.resolve(os.homedir(), '.theia', 'recentworkspace.json');
    }
}

interface RecentWorkspacePathsData {
    recentRoots: string[];
}

namespace RecentWorkspacePathsData {
    export function is(data: Object | undefined): data is RecentWorkspacePathsData {
        // tslint:disable-next-line:no-any
        return !!data && typeof data === 'object' && ('recentRoots' in data) && Array.isArray((data as any)['recentRoots']);
    }
}
