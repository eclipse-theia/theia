// *****************************************************************************
// Copyright (C) 2021 TypeFox and others.
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

import type { MenuItemConstructorOptions } from '../menu';

export const RequestTitleBarStyle = 'requestTitleBarStyle';
export const TitleBarStyleChanged = 'titleBarStyleChanged';
export const TitleBarStyleAtStartup = 'titleBarStyleAtStartup';
export const Restart = 'restart';
/**
 * Emitted by main when close requested.
 */
export const CLOSE_REQUESTED_SIGNAL = 'close-requested';
/**
 * Emitted by window when a reload is requested.
 */
export const RELOAD_REQUESTED_SIGNAL = 'reload-requested';
/**
 * Emitted by the window when the application changes state
 */
export const APPLICATION_STATE_CHANGE_SIGNAL = 'application-state-changed';

export enum StopReason {
    /**
     * Closing the window with no prospect of restart.
     */
    Close,
    /**
     * Reload without closing the window.
     */
    Reload,
    /**
     * Reload that includes closing the window.
     */
    Restart, // eslint-disable-line @typescript-eslint/no-shadow
}

export interface CloseRequestArguments {
    confirmChannel: string;
    cancelChannel: string;
    reason: StopReason;
}

/**
 * Request is sent by the render to the main to rebuild and set the menu.
 */
export namespace SetMenu {
    export const Signal = 'setMenu';
    export interface Params {
        readonly template: MenuItemConstructorOptions[] | undefined;
    }
}
/**
 * Request sent by the render to the main to build and show the context menu.
 */
export namespace ShowContextMenu {
    export const Signal = 'showContextMenu';
    export interface Params {
        readonly template: MenuItemConstructorOptions[];
        /** Must be an integer. */
        readonly x: number;
        /** Must be an integer. */
        readonly y: number;
        readonly contextMenuId: string;
    }
};
/**
 * Sent by the renderer to main to programmatically close an open context menu identified by the unique `contextMenuId`.
 * This request might be ignored by the recipient if no open context menu exists with the ID. For example, the context menu was closed by user clicking away.
 */
export namespace CloseContextMenu {
    export const Signal = 'closeContextMenu';
    export interface Params {
        readonly contextMenuId: string;
    }
}
/**
 * Event sent by the main to the render when a context menu was closed.
 */
export namespace ContextMenuDidClose {
    export const Signal = 'contextMenuDidClose';
    export interface Params {
        readonly contextMenuId: string;
    }
}
/**
 * Event sent by the main to the renderer when one of the menu items was clicked.
 */
export namespace MenuItemDidClick {
    export const Signal = 'menuItemDidClick';
    export interface Params {
        readonly commandId: string;
        /**
         * The arguments will be serialized with the [_Structured Clone Algorithm_](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm).
         * Sending Functions, Promises, Symbols, DOM or special electron objects, WeakMaps, or WeakSets will throw an exception.
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        readonly args?: any[];
    }
}
/**
 * Sent by the renderer to the main to updated the `checked` state of the menu item IDs.
 */
export namespace UpdateMenuItems {
    export const Signal = 'updateMenuItems';
    export interface Params {
        readonly menuItems: { id: string, checked: boolean }[];
    }
}
