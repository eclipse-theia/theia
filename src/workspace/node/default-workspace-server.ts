/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import { injectable, inject } from "inversify";
import { ILogger } from '../../application/common';
import { WorkspaceServer } from "../common";
import { FileUri } from "../../application/node";

@injectable()
export class DefaultWorkspaceServer implements WorkspaceServer {

    public static ROOT_DIR_OPTION = '--root-dir=';

    protected root: Promise<string>;

    constructor(
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        const rootDir = this.getRootDir();
        if (rootDir) {
            this.root = Promise.resolve(FileUri.create(rootDir).toString());
        } else {
            this.root = Promise.reject(`The directory is unknown, please use '${DefaultWorkspaceServer.ROOT_DIR_OPTION}' option.`);
        }
    }

    setRoot(uri: string): Promise<void> {
        this.root = Promise.resolve(uri);
        return Promise.resolve();
    }

    getRoot(): Promise<string> {
        return this.root;
    }

    protected getRootDir(): string {
        const arg = process.argv.filter(arg => arg.startsWith(DefaultWorkspaceServer.ROOT_DIR_OPTION))[0];
        const cwd = process.cwd();
        if (!arg) {
            this.logger.info(`${DefaultWorkspaceServer.ROOT_DIR_OPTION} was not present. Falling back to current working directory: '${cwd}'.`)
            return cwd;
        }
        const rootDir = arg.substring(DefaultWorkspaceServer.ROOT_DIR_OPTION.length);
        if (path.isAbsolute(rootDir)) {
            return rootDir;
        }
        return path.join(cwd, rootDir);
    }

}