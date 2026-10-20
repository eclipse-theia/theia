// *****************************************************************************
// Copyright (C) 2026 Vinay Kaushal and others.
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

import { ContextKey } from '@theia/core/lib/browser/context-key-service';

/** The `restartFrameSupported` context key: whether the session of the focused stack frame supports `restartFrame` requests, as in VS Code. */
export const DebugRestartFrameSupportedKey = Symbol('DebugRestartFrameSupportedKey');
export type DebugRestartFrameSupportedKey = ContextKey<boolean>;

/** The `stackFrameSupportsRestart` context key: whether the focused stack frame can be restarted, as in VS Code. */
export const DebugStackFrameSupportsRestartKey = Symbol('DebugStackFrameSupportsRestartKey');
export type DebugStackFrameSupportsRestartKey = ContextKey<boolean>;
