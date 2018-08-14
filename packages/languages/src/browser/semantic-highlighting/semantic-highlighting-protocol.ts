/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { NotificationType } from 'vscode-jsonrpc';
import { VersionedTextDocumentIdentifier } from '..';

// NOTE: This module can be removed, once the semantic highlighting will become the part of the LSP.
// https://github.com/Microsoft/vscode-languageserver-node/issues/368

export interface SemanticHighlightingParams {
    readonly textDocument: VersionedTextDocumentIdentifier;
    readonly lines: SemanticHighlightingInformation[];
}

export interface SemanticHighlightingInformation {
    readonly line: number;
    readonly tokens?: string;
}

export namespace SemanticHighlight {
    export const type = new NotificationType<SemanticHighlightingParams, void>('textDocument/semanticHighlighting');
}
