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

import { UriComponents, URI } from '@theia/core/lib/common/uri';
import { CellRange } from '@theia/notebook/lib/common';
import { NotebookEditorWidget } from '@theia/notebook/lib/browser';
import { MAIN_RPC_CONTEXT, NotebookDocumentShowOptions, NotebookEditorRevealType, NotebookEditorsExt, NotebookEditorsMain } from '../../../common';
import { RPCProtocol } from '../../../common/rpc-protocol';
import { interfaces } from '@theia/core/shared/inversify';
import { open, OpenerService } from '@theia/core/lib/browser';

export class NotebookEditorsMainImpl implements NotebookEditorsMain {

    protected readonly proxy: NotebookEditorsExt;
    protected readonly openerService: OpenerService;

    protected readonly mainThreadEditors = new Map<string, NotebookEditorWidget>();

    constructor(
        rpc: RPCProtocol,
        container: interfaces.Container
    ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.NOTEBOOK_EDITORS_EXT);
        this.openerService = container.get(OpenerService);
    }

    async $tryShowNotebookDocument(uriComponents: UriComponents, viewType: string, options: NotebookDocumentShowOptions): Promise<string> {
        const editor = await open(this.openerService, URI.fromComponents(uriComponents), {});
        return (editor as NotebookEditorWidget).id;
    }
    $tryRevealRange(id: string, range: CellRange, revealType: NotebookEditorRevealType): Promise<void> {
        throw new Error('Method not implemented.');
    }
    $trySetSelections(id: string, range: CellRange[]): void {
        throw new Error('Method not implemented.');
    }

    handleEditorsAdded(editors: readonly NotebookEditorWidget[]): void {
        for (const editor of editors) {
            this.mainThreadEditors.set(editor.id, editor);
        }
    }

    handleEditorsRemoved(editorIds: readonly string[]): void {
        for (const id of editorIds) {
            this.mainThreadEditors.get(id)?.dispose();
            this.mainThreadEditors.delete(id);
        }
    }

    dispose(): void {
    }
}
