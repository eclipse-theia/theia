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

import { StopReason } from '../../common/frontend-application-state';
/** @deprecated @since 1.28 import from common/frontend-application-state instead */
export { StopReason };

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

export interface CloseRequestArguments {
    confirmChannel: string;
    cancelChannel: string;
    reason: StopReason;
}
