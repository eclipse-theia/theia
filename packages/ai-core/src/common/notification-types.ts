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

export const NOTIFICATION_TYPE_ON = 'on' as const;
export const NOTIFICATION_TYPE_OFF = 'off' as const;
export const NOTIFICATION_TYPE_OS_NOTIFICATION = 'os-notification' as const;
export const NOTIFICATION_TYPE_MESSAGE = 'message' as const;
export const NOTIFICATION_TYPE_BLINK = 'blink' as const;

export const NOTIFICATION_CONTROL_TYPES = [
    NOTIFICATION_TYPE_ON,
    NOTIFICATION_TYPE_OFF
] as const;

export const NOTIFICATION_CONCRETE_TYPES = [
    NOTIFICATION_TYPE_OS_NOTIFICATION,
    NOTIFICATION_TYPE_MESSAGE,
    NOTIFICATION_TYPE_BLINK
] as const;

export const ALL_NOTIFICATION_TYPES = [
    ...NOTIFICATION_CONTROL_TYPES,
    ...NOTIFICATION_CONCRETE_TYPES
] as const;

export type ConcreteNotificationType = typeof NOTIFICATION_CONCRETE_TYPES[number];
export type NotificationType = typeof ALL_NOTIFICATION_TYPES[number];
