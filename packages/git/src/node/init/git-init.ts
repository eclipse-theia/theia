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

import { injectable } from 'inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';

/**
 * Initializer hook for Git.
 */
export const GitInit = Symbol('GitInit');
export interface GitInit extends Disposable {

    /**
     * Called before `Git` is ready to be used in Theia. Git operations cannot be executed before the returning promise is not resolved or rejected.
     *
     * This implementation does nothing at all.
     */
    init(): Promise<void>;

}

/**
 * The default initializer. It is used in the browser. Does nothing at all.
 */
@injectable()
export class DefaultGitInit implements GitInit {

    protected readonly toDispose = new DisposableCollection();

    async init(): Promise<void> {
        // NOOP
    }

    dispose(): void {
        this.toDispose.dispose();
    }

}
