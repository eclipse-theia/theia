/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import * as mac from 'macaddress';
import { EnvExtImpl } from '../env';
import { RPCProtocol } from '../../common/rpc-protocol';
import { createHash } from 'crypto';
import { v4 } from 'uuid';

/**
 * Provides machineId using mac address. It's only possible on node side
 * Extending the common class
 */
export class EnvNodeExtImpl extends EnvExtImpl {

    private macMachineId: string;

    constructor(rpc: RPCProtocol) {
        super(rpc);
        mac.one((err, macAddress) => {
            if (err) {
                this.macMachineId = v4();
            } else {
                this.macMachineId = createHash('sha256').update(macAddress, 'utf8').digest('hex');
            }
        });

    }

    /**
     * override machineID
     */
    get machineId(): string {
        return this.macMachineId;
    }

    /**
     * Provides application root.
     */
    get appRoot(): string {
        return __dirname;
    }

}
