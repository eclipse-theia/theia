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

import { injectable, inject, postConstruct } from "inversify";
import { FileUri } from '@theia/core/lib/node';
import { CliContribution } from '@theia/core/lib/node/cli';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MessageService, ILogger } from '@theia/core';
import { WorkspaceServer } from "../common";
import URI from '@theia/core/lib/common/uri';

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

    protected root: Deferred<string | undefined> = new Deferred();

    @inject(WorkspaceCliContribution)
    protected readonly cliParams: WorkspaceCliContribution;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @postConstruct()
    protected async init() {
        let root = await this.getWorkspaceURIFromCli();
        if (!root) {
            const data = await this.readFromUserHome();
            if (data && data.recentRoots) {
                root = data.recentRoots[0];
            }
        }
        this.root.resolve(root);
    }

    getWorkspace(): Promise<string | undefined> {
        return this.root.promise;
    }

    async setWorkspace(uri: string): Promise<void> {
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
        const data = await this.readFromUserHome();
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

    private workspaceStillExist(wspath: string): boolean {
        const uri = new URI(wspath);
        if (fs.pathExistsSync(uri.path.toString())) {
            return true;
        }
        return false;
    }

    protected async getWorkspaceURIFromCli(): Promise<string | undefined> {
        const arg = await this.cliParams.workspaceRoot.promise;
        return arg !== undefined ? FileUri.create(arg).toString() : undefined;
    }

    /**
     * Writes the given uri as the most recently used workspace root to the user's home directory.
     * @param uri most recently used uri
     */
    private async writeToUserHome(data: WorkspaceData): Promise<void> {
        const file = this.getUserStoragePath();
        if (!await fs.pathExists(file)) {
            await fs.mkdirs(path.resolve(file, '..'));
        }
        await fs.writeJson(file, data);
    }

    /**
     * Reads the most recently used workspace root from the user's home directory.
     */
    private async readFromUserHome(): Promise<WorkspaceData | undefined> {
        const file = this.getUserStoragePath();
        if (await fs.pathExists(file)) {
            const rawContent = await fs.readFile(file, 'utf-8');
            const content = rawContent.trim();
            if (!content) {
                return undefined;
            }

            let config;
            try {
                config = JSON.parse(content);
            } catch (error) {
                this.messageService.warn(`Parse error in '${file}':\nFile will be ignored...`);
                error.message = `${file}:\n${error.message}`;
                this.logger.warn('[CAUGHT]', error);
                return undefined;
            }

            if (WorkspaceData.is(config)) {
                return config;
            }
        }

        return undefined;
    }

    protected getUserStoragePath(): string {
        return path.resolve(os.homedir(), '.theia', 'recentworkspace.json');
    }

}

interface WorkspaceData {
    recentRoots: string[];
}

namespace WorkspaceData {
    // tslint:disable-next-line:no-any
    export function is(data: any): data is WorkspaceData {
        return data.recentRoots !== undefined;
    }
}
