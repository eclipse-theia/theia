/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import findGit from 'find-git-exec';
import { dirname } from 'path';
import { pathExists } from 'fs-extra';
import { ILogger } from '@theia/core/lib/common/logger';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';

/**
 * Initializer hook for Git.
 */
export const GitInit = Symbol('GitInit');
export interface GitInit extends Disposable {

    /**
     * Called before `Git` is ready to be used in Theia. Git operations cannot be executed before the returning promise is not resolved or rejected.
     */
    init(): Promise<void>;

}

/**
 * The default initializer. It is used in the browser.
 *
 * Configures the Git extension to use the Git executable from the `PATH`.
 */
@injectable()
export class DefaultGitInit implements GitInit {

    protected readonly toDispose = new DisposableCollection();

    @inject(ILogger)
    protected readonly logger: ILogger;

    async init(): Promise<void> {
        const { env } = process;
        if (typeof env.LOCAL_GIT_DIRECTORY !== 'undefined' || typeof env.GIT_EXEC_PATH !== 'undefined') {
            await this.handleExternalNotFound('Cannot use Git from the PATH when the LOCAL_GIT_DIRECTORY or the GIT_EXEC_PATH environment variables are set.');
        } else {
            try {
                const { execPath, path, version } = await findGit();
                if (!!execPath && !!path && !!version) {
                    // https://github.com/desktop/dugite/issues/111#issuecomment-323222834
                    // Instead of the executable path, we need the root directory of Git.
                    const dir = dirname(dirname(path));
                    const [execPathOk, pathOk, dirOk] = await Promise.all([pathExists(execPath), pathExists(path), pathExists(dir)]);
                    if (execPathOk && pathOk && dirOk) {
                        process.env.LOCAL_GIT_DIRECTORY = dir;
                        process.env.GIT_EXEC_PATH = execPath;
                        this.logger.info(`Using Git [${version}] from the PATH. (${path})`);
                        return;
                    }
                }
                await this.handleExternalNotFound();
            } catch (err) {
                await this.handleExternalNotFound(err);
            }
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    // tslint:disable-next-line:no-any
    protected async handleExternalNotFound(err?: any): Promise<void> {
        if (err) {
            this.logger.error(err);
        }
        this.logger.info('Could not find Git on the PATH. Falling back to the embedded Git.');
    }

}
