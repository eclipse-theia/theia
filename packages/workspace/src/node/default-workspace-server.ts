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

import { injectable, inject } from "inversify";
import { FileUri } from '@theia/core/lib/node';
import { CliContribution } from '@theia/core/lib/node/cli';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { WorkspaceServer } from "../common";

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

    protected root: Promise<string | undefined>;

    constructor(
        @inject(WorkspaceCliContribution) protected readonly cliParams: WorkspaceCliContribution
    ) {
        this.root = this.getRootURIFromCli();
        this.root.then(async root => {
            if (!root) {
                const data = await this.readFromUserHome();
                if (data && data.recentRoots) {
                    this.root = Promise.resolve(data.recentRoots[0]);
                }
            }
        });
    }

    getRoot(): Promise<string | undefined> {
        return this.root;
    }

    setRoot(uri: string): Promise<void> {
        this.root = Promise.resolve(uri);
        this.writeToUserHome({
            recentRoots: [uri]
        });
        return Promise.resolve();
    }

    protected async getRootURIFromCli(): Promise<string | undefined> {
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
            const config = await fs.readJson(file);
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
