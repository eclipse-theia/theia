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

import { WindowState } from "@theia/plugin";
import { WindowStateExt } from "../api/plugin-api";
import { Event, Emitter } from "@theia/core/lib/common/event";

export class WindowStateExtImpl implements WindowStateExt {

    private windowStateCached: WindowState;

    private windowStateChangedEmitter = new Emitter<WindowState>();
    public readonly onDidChangeWindowState: Event<WindowState> = this.windowStateChangedEmitter.event;

    constructor() {
        this.windowStateCached = { focused: true }; // supposed tab is active on start
    }

    getWindowState(): WindowState {
        return this.windowStateCached;
    }

    $onWindowStateChanged(focused: boolean): void {
        const state = { focused: focused };
        if (state === this.windowStateCached) {
            return;
        }

        this.windowStateCached = state;
        this.windowStateChangedEmitter.fire(state);
    }

}
