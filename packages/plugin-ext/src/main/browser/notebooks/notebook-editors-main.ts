// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents } from '@theia/core/lib/common/uri';
import { CellRange } from '@theia/notebook/lib/common';
import { MAIN_RPC_CONTEXT, NotebookDocumentShowOptions, NotebookEditorRevealType, NotebookEditorsExt, NotebookEditorsMain } from '../../../common';
import { RPCProtocol } from '../../../common/rpc-protocol';

export class NotebookEditorsMainImpl implements NotebookEditorsMain {

    protected readonly proxy: NotebookEditorsExt;

    constructor(
        rpc: RPCProtocol,
    ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.NOTEBOOK_EDITORS_EXT);
    }

    $tryShowNotebookDocument(uriComponents: UriComponents, viewType: string, options: NotebookDocumentShowOptions): Promise<string> {
        throw new Error('Method not implemented.');
    }
    $tryRevealRange(id: string, range: CellRange, revealType: NotebookEditorRevealType): Promise<void> {
        throw new Error('Method not implemented.');
    }
    $trySetSelections(id: string, range: CellRange[]): void {
        throw new Error('Method not implemented.');
    }

}
