// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const NOTIFICATION_TYPE_OFF = 'off';
export const NOTIFICATION_TYPE_OS_NOTIFICATION = 'os-notification';
export const NOTIFICATION_TYPE_MESSAGE = 'message';
export const NOTIFICATION_TYPE_BLINK = 'blink';
export type NotificationType =
    | typeof NOTIFICATION_TYPE_OFF
    | typeof NOTIFICATION_TYPE_OS_NOTIFICATION
    | typeof NOTIFICATION_TYPE_MESSAGE
    | typeof NOTIFICATION_TYPE_BLINK;
export const NOTIFICATION_TYPES: NotificationType[] = [
    NOTIFICATION_TYPE_OFF,
    NOTIFICATION_TYPE_OS_NOTIFICATION,
    NOTIFICATION_TYPE_MESSAGE,
    NOTIFICATION_TYPE_BLINK,
];
