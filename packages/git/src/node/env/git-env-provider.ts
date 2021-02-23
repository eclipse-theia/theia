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

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';

/**
 * Provides an additional environment object when executing every single Git command.
 */
export const GitEnvProvider = Symbol('GitEnvProvider');
export interface GitEnvProvider extends Disposable {

    /**
     * The additional environment object that will be set before executing every single Git command.
     */
    getEnv(): Promise<Object>;

}

/**
 * The default Git environment provider. Does nothing.
 */
@injectable()
export class DefaultGitEnvProvider implements GitEnvProvider {

    protected toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        // NOOP
    }

    async getEnv(): Promise<Object> {
        return {};
    }

    dispose(): void {
        if (!this.toDispose.disposed) {
            this.toDispose.dispose();
        }
    }

}
