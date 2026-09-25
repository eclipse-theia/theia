// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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

import { SimpleMonacoEditor } from '@theia/monaco/lib/browser/simple-monaco-editor';

const editors = new WeakMap<Element, SimpleMonacoEditor>();

/**
 * The Monaco editors that code parts render into, keyed by their `.theia-CodeWrapper` element, so features that
 * work on the chat DOM (e.g. find in chat) can reach the editor that renders a code block.
 */
export namespace CodeWrapperEditors {

    export const CLASS = 'theia-CodeWrapper';

    /** The editor rendered into `element`, once it has been created. */
    export function get(element: Element): SimpleMonacoEditor | undefined {
        return editors.get(element);
    }

    export function set(element: Element, editor: SimpleMonacoEditor): void {
        editors.set(element, editor);
    }

    export function remove(element: Element): void {
        editors.delete(element);
    }
}
