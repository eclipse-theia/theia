// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { nls } from '@theia/core';
import { UriComponents } from '@theia/core/lib/common/uri';
import { Range, SymbolKind, SymbolTag } from '@theia/core/shared/vscode-languageserver-protocol';

export const CALLHIERARCHY_ID = 'callhierarchy';
export const CALL_HIERARCHY_TOGGLE_COMMAND_ID = 'callhierarchy:toggle';
export const CALL_HIERARCHY_LABEL = nls.localizeByDefault('Call Hierarchy');

export interface CallHierarchyItem {
    _sessionId?: string;
    _itemId?: string;

    kind: SymbolKind;
    name: string;
    detail?: string;
    uri: UriComponents;
    range: Range;
    selectionRange: Range;
    tags?: readonly SymbolTag[];
    data?: unknown;
}

export interface CallHierarchyIncomingCall {
    from: CallHierarchyItem;
    fromRanges: Range[];
}

export interface CallHierarchyOutgoingCall {
    to: CallHierarchyItem;
    fromRanges: Range[];
}
