/********************************************************************************
 * Copyright (C) 2019 Arm and others.
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

import { injectable } from 'inversify';
import { ChildProcess, spawn } from 'child_process';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';

/**
 * Initializer hook for Hg.
 */
export const HgInit = Symbol('HgInit');
export interface HgInit extends Disposable {

    /**
     * Called before `Hg` is first used for a given Hg repository.
     *
     * Note that the child process may be killed for inactive repositories.  In such cases this function will
     * be called again if further Mercurial commands are to be executed against the repository.
     */
    startCommandServer(repositoryPath: string): Promise<ChildProcess>;

}

/**
 * The default initializer. It is used in the browser.
 *
 * Configures the Hg extension to use the Hg executable from the `PATH`.
 */
@injectable()
export class DefaultHgInit implements HgInit {

    protected readonly toDispose = new DisposableCollection();

    async startCommandServer(repositoryPath: string): Promise<ChildProcess> {
        const options = ['--config', 'ui.interactive=True', '--config', 'ui.merge=internal:fail', 'serve', '--cmdserver', 'pipe', '--cwd', repositoryPath];
        return spawn('hg', options);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

}
