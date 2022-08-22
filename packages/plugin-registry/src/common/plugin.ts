// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import type { Event } from '@theia/core';

export interface Plugin {
    readonly id: string;
    readonly name: string;
    readonly displayName?: string;
    readonly author: string;
    readonly type: Plugin.Type;
    readonly state: Plugin.State;
    readonly reloadRequired: boolean;
    readonly onStateChanged: Event<this>;
    install(): Promise<void>;
    uninstall(): Promise<void>;
    update(): Promise<void>;
    enable(): Promise<void>;
    disable(): Promise<void>;
}

export namespace Plugin {

    export enum Type {
        /**
         * Can only be enabled or disabled.
         */
        Builtin,
        /**
         * Can be installed, uninstalled, updated, enabled or disabled.
         */
        User
    }

    /**
     * Most common lifecycle steps that plugins will go through.
     */
    export enum State {
        Installing,
        Enabling,
        Enabled,
        Updating,
        Disabling,
        Disabled,
        Uninstalling,
        Uninstalled
    }

    export function isInstalled(plugin: Plugin): boolean {
        return plugin.state === State.Enabling
            || plugin.state === State.Enabled
            || plugin.state === State.Disabling
            || plugin.state === State.Disabled;
    }

    export function isEnabled(plugin: Plugin): boolean {
        return plugin.state === State.Enabled;
    }
}
