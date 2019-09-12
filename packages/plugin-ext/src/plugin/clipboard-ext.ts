/********************************************************************************
 * Copyright (C) 2019 RedHat and others.
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

import * as theia from '@theia/plugin';
import { RPCProtocol } from '../common/rpc-protocol';
import { PLUGIN_RPC_CONTEXT, ClipboardMain } from '../common';

export class ClipboardExt implements theia.Clipboard {

    protected readonly proxy: ClipboardMain;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.CLIPBOARD_MAIN);
    }

    readText(): Promise<string> {
        return this.proxy.$readText();
    }

    writeText(value: string): Promise<void> {
        return this.proxy.$writeText(value);
    }

}
