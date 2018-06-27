/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { WindowStateExt, MAIN_RPC_CONTEXT } from "../../api/plugin-api";
import { RPCProtocol } from "../../api/rpc-protocol";

export class WindowStateMain {

    private proxy: WindowStateExt;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.WINDOW_STATE_EXT);

        window.addEventListener("focus", () => this.onFocusChanged(true));
        window.addEventListener("blur", () => this.onFocusChanged(false));
    }

    private onFocusChanged(focused: boolean): void {
        this.proxy.$onWindowStateChanged(focused);
    }

}
