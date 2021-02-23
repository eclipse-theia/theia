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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { DefaultGitEnvProvider } from '../../node/env/git-env-provider';
import { Askpass } from '../askpass/askpass';

/**
 * Git environment provider for Electron.
 *
 * This Git environment provider is customized for the Electron-based application. It sets the `GIT_ASKPASS` environment variable, to run
 * a custom script for the authentication.
 */
@injectable()
export class ElectronGitEnvProvider extends DefaultGitEnvProvider {

    @inject(Askpass)
    protected readonly askpass: Askpass;
    protected _env: Object | undefined;

    @postConstruct()
    protected init(): void {
        super.init();
        this.toDispose.push(this.askpass);
    }

    async getEnv(): Promise<Object> {
        if (!this._env) {
            this._env = this.askpass.getEnv();
        }
        return this._env;
    }

}
