/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
