/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { session } from '../../shared/electron';
import { inject, injectable } from 'inversify';
import { ElectronSecurityToken } from '../electron-common/electron-token';

@injectable()
export class ElectronSecurityTokenService {

    @inject(ElectronSecurityToken)
    protected readonly electronSecurityToken: ElectronSecurityToken;

    async setElectronSecurityTokenCookie(url: string): Promise<void> {
        await session.defaultSession.cookies.set({
            url,
            name: ElectronSecurityToken,
            value: JSON.stringify(this.electronSecurityToken),
            httpOnly: true
        });
    }
}
