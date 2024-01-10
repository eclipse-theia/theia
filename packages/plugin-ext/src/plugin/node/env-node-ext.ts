// *****************************************************************************
// Copyright (C) 2019 Red Hat, Inc. and others.
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

import { injectable } from '@theia/core/shared/inversify';
import * as mac from 'macaddress';
import { EnvExtImpl } from '../env';
import { createHash } from 'crypto';
import { generateUuid } from '@theia/core/lib/common/uuid';
import fs = require('fs');

/**
 * Provides machineId using mac address. It's only possible on node side
 * Extending the common class
 */
@injectable()
export class EnvNodeExtImpl extends EnvExtImpl {

    private macMachineId: string;
    private _isNewAppInstall: boolean;

    constructor() {
        super();

        mac.one((err, macAddress) => {
            if (err) {
                this.macMachineId = generateUuid();
            } else {
                this.macMachineId = createHash('sha256').update(macAddress, 'utf8').digest('hex');
            }
        });
        this._isNewAppInstall = this.computeIsNewAppInstall();
    }

    /**
     * override machineID
     */
    override get machineId(): string {
        return this.macMachineId;
    }

    get isNewAppInstall(): boolean {
        return this._isNewAppInstall;
    }

    private computeIsNewAppInstall(): boolean {
        const creation = fs.statSync(__filename).birthtimeMs;
        const current = Date.now();
        const dayMs = 24 * 3600 * 1000;
        return (current - creation) < dayMs;
    }
}
