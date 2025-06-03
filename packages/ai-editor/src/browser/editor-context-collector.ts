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

import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';

/**
 * Interface for additional context data that can be collected from the editor.
 * This allows for flexible extension of editor context information.
 */
export interface EditorContextData {
    [key: string]: unknown;
}

/**
 * Interface for contributions that collect additional context data from the editor.
 * Implementations should provide a unique identifier and a method to collect context data.
 */
export interface EditorContextCollectorContribution {
    /**
     * Unique identifier for this collector.
     * Used to organize collected data in the final context output.
     */
    readonly id: string;

    /**
     * Priority for this collector. Higher numbers are processed first.
     * Default priority is 0. Use higher values for more important collectors.
     */
    readonly priority: number;

    /**
     * Collect additional context data from the given editor.
     *
     * @param editor The Monaco editor instance to collect context from
     * @returns Promise resolving to context data, or undefined if no context to provide
     */
    collectContext(editor: MonacoEditor): Promise<EditorContextData | undefined>;
}
export const EditorContextCollectorContribution = Symbol('EditorContextCollectorContribution');

