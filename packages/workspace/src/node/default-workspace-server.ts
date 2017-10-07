/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import { injectable, inject } from "inversify";
import { ILogger } from '@theia/core/lib/common';
import { WorkspaceServer } from "../common";
import { CliContribution } from '@theia/core/lib/node/cli';
import * as yargs from 'yargs';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { FileUri } from '@theia/core/lib/node';

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

    protected root: Promise<string>;

    constructor(
        @inject(WorkspaceCliContribution) protected readonly cliParams: WorkspaceCliContribution,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        this.root = this.getRootURI();
    }

    setRoot(uri: string): Promise<void> {
        this.root = Promise.resolve(uri);
        return Promise.resolve();
    }

    getRoot(): Promise<string> {
        return this.root;
    }

    protected async getRootURI(): Promise<string> {
        const arg = await this.cliParams.workspaceRoot.promise;
        const cwd = process.cwd();
        if (!arg) {
            this.logger.info(`No workspace folder provided. Falling back to current working directory: '${cwd}'.`)
            return FileUri.create(cwd).toString();
        }
        return FileUri.create(arg).toString();
    }

}