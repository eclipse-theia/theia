/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
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

import { ResourceLabelFormatter } from '@theia/plugin';
import { Disposable } from '@theia/core/lib/common/disposable';
import { LabelServiceExt, LabelServiceMain, PLUGIN_RPC_CONTEXT } from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';

export class LabelServiceExtImpl implements LabelServiceExt {
    private handle: number = 0;
    private proxy: LabelServiceMain;
    constructor(readonly rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.LABEL_SERVICE_MAIN);
    }

    $registerResourceLabelFormatter(formatter: ResourceLabelFormatter): Disposable {
        const handle = this.handle++;
        this.proxy.$registerResourceLabelFormatter(handle, formatter);
        return Disposable.create(() => {
            this.proxy.$unregisterResourceLabelFormatter(handle);
        });
    }
}
