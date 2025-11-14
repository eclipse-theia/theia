// *****************************************************************************
// Copyright (C) 2025 TypeFox and others.
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

import { Widget, DockLayout } from '@theia/core/lib/browser';

/**
 * Symbol used to bind SplitEditorContribution implementations.
 */
export const SplitEditorContribution = Symbol('SplitEditorContribution');

/**
 * A contribution interface for handling split operations on different editor types.
 * Implementations should handle specific editor widget types (e.g., text editors, notebook editors).
 *
 * @template W the specific widget type this contribution handles
 */
export interface SplitEditorContribution<W extends Widget = Widget> {
    /**
     * Determines whether this contribution can handle the split operation for the given widget.
     * @param widget the widget to check
     * @returns a priority number (higher means higher priority), or 0 if this contribution cannot handle the widget
     */
    canHandle(widget: Widget): number;

    /**
     * Splits the given widget according to the specified split mode.
     * @param widget the widget to split
     * @param splitMode the direction in which to split
     * @returns the newly created widget, or undefined if the split operation failed
     */
    split(widget: W, splitMode: DockLayout.InsertMode): Promise<W | undefined>;
}

