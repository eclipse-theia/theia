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

import { injectable, inject } from '@theia/core/shared/inversify';
import findGit from 'find-git-exec';
import { dirname } from 'path';
import { pathExists } from '@theia/core/shared/fs-extra';
import { ILogger } from '@theia/core/lib/common/logger';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { MessageService } from '@theia/core';

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

    @inject(MessageService)
    protected readonly messages: MessageService;

    async init(): Promise<void> {
        const { env } = process;
        try {
            const { execPath, path, version } = await findGit();
            if (!!execPath && !!path && !!version) {
                // https://github.com/desktop/dugite/issues/111#issuecomment-323222834
                // Instead of the executable path, we need the root directory of Git.
                const dir = dirname(dirname(path));
                const [execPathOk, pathOk, dirOk] = await Promise.all([pathExists(execPath), pathExists(path), pathExists(dir)]);
                if (execPathOk && pathOk && dirOk) {
                    if (typeof env.LOCAL_GIT_DIRECTORY !== 'undefined' && env.LOCAL_GIT_DIRECTORY !== dir) {
                        this.logger.error(`Misconfigured env.LOCAL_GIT_DIRECTORY: ${env.LOCAL_GIT_DIRECTORY}. dir was: ${dir}`);
                        this.messages.error('The LOCAL_GIT_DIRECTORY env variable was already set to a different value.', { timeout: 0 });
                        return;
                    }
                    if (typeof env.GIT_EXEC_PATH !== 'undefined' && env.GIT_EXEC_PATH !== execPath) {
                        this.logger.error(`Misconfigured env.GIT_EXEC_PATH: ${env.GIT_EXEC_PATH}. execPath was: ${execPath}`);
                        this.messages.error('The GIT_EXEC_PATH env variable was already set to a different value.', { timeout: 0 });
                        return;
                    }
                    process.env.LOCAL_GIT_DIRECTORY = dir;
                    process.env.GIT_EXEC_PATH = execPath;
                    this.logger.info(`Using Git [${version}] from the PATH. (${path})`);
                    return;
                }
            }
            this.messages.error('Could not find Git on the PATH.', { timeout: 0 });
        } catch (err) {
            this.logger.error(err);
            this.messages.error('An unexpected error occurred when locating the Git executable.', { timeout: 0 });
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }

}
