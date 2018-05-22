/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
