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

import { Widget } from '@theia/core/src/browser/widgets';
import { DebugSession } from '../debug-model';
import { DebugSelection } from './debug-selection-service';

export namespace DebugStyles {
    export const DEBUG_CONTAINER = 'theia-debug-container';
    export const DEBUG_ENTRY = 'theia-debug-entry';
    export const DEBUG_ITEM = 'theia-debug-item';
}

/**
 * It allows to reuse the widget for different debug session.
 */
export interface DebugWidget extends Widget {
    debugContext: DebugContext | undefined;
}

export interface DebugContext {
    debugSession: DebugSession;
    debugSelection: DebugSelection;
}

/**
 * Debug widget options. (JSON)
 */
export const DebugWidgetOptions = Symbol('DebugWidgetOptions');
export interface DebugWidgetOptions {
    readonly panelId: string;
}
