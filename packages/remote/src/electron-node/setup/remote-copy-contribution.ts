// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { ApplicationPackage } from '@theia/core/shared/@theia/application-package';
import { inject, injectable } from '@theia/core/shared/inversify';
import { glob as globCallback } from 'glob';
import { promisify } from 'util';
import * as path from 'path';
import { MaybePromise } from '@theia/core';

const promiseGlob = promisify(globCallback);

export const RemoteCopyContribution = Symbol('RemoteCopyContribution');

export interface RemoteCopyContribution {
    copy(registry: RemoteCopyRegistry): MaybePromise<void>
}

export interface RemoteCopyOptions {
    /**
     * The mode that the file should be set to once copied to the remote.
     *
     * Only relevant for POSIX-like systems
     */
    mode?: number;
}

export interface RemoteFile {
    path: string
    target: string
    options?: RemoteCopyOptions;
}

@injectable()
export class RemoteCopyRegistry {

    @inject(ApplicationPackage)
    protected readonly applicationPackage: ApplicationPackage;

    protected readonly files: RemoteFile[] = [];

    getFiles(): RemoteFile[] {
        return this.files.slice();
    }

    async glob(pattern: string, target?: string): Promise<void> {
        const projectPath = this.applicationPackage.projectPath;
        const globResult = await promiseGlob(pattern, {
            cwd: projectPath
        });
        const relativeFiles = globResult.map(file => path.relative(projectPath, file));
        for (const file of relativeFiles) {
            const targetFile = this.withTarget(file, target);
            this.files.push({
                path: file,
                target: targetFile
            });
        }
    }

    file(file: string, target?: string, options?: RemoteCopyOptions): void {
        const targetFile = this.withTarget(file, target);
        this.files.push({
            path: file,
            target: targetFile,
            options
        });
    }

    async directory(dir: string, target?: string): Promise<void> {
        return this.glob(dir + '/**', target);
    }

    protected withTarget(file: string, target?: string): string {
        return target ? path.join(target, file) : file;
    }
}
