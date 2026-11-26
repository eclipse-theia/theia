// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import URI from '@theia/core/lib/common/uri';
import { TextEditorDocument } from './editor.js';

export const TextEditorDocumentService = Symbol('TextEditorDocumentService');
/**
 * Gives access to the text documents that are loaded in memory, whether or not they are shown in an editor.
 *
 * Code that writes files directly can use it to detect unsaved changes to a file that a write would conflict with.
 * Nothing is bound to this symbol unless an editor implementation, such as `@theia/monaco`, is part of the application,
 * so inject it as optional.
 */
export interface TextEditorDocumentService {
    /**
     * @returns the document loaded in memory for the given resource, or `undefined` if there is none.
     */
    getDocument(uri: URI): TextEditorDocument | undefined;
}
