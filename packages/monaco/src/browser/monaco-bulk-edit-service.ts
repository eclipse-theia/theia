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

import { injectable, inject } from '@theia/core/shared/inversify';
import { MonacoWorkspace } from './monaco-workspace';
import {
    IBulkEditOptions, IBulkEditPreviewHandler, IBulkEditResult, IBulkEditService, ResourceEdit
} from '@theia/monaco-editor-core/esm/vs/editor/browser/services/bulkEditService';
import { IDisposable } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';
import { WorkspaceEdit } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';

@injectable()
export class MonacoBulkEditService implements IBulkEditService {
    declare readonly _serviceBrand: undefined;

    @inject(MonacoWorkspace)
    protected readonly workspace: MonacoWorkspace;

    private _previewHandler?: IBulkEditPreviewHandler;

    async apply(editsIn: ResourceEdit[] | WorkspaceEdit, options?: IBulkEditOptions): Promise<IBulkEditResult> {
        const edits = Array.isArray(editsIn) ? editsIn : ResourceEdit.convert(editsIn);

        if (this._previewHandler && (options?.showPreview || edits.some(value => value.metadata?.needsConfirmation))) {
            editsIn = await this._previewHandler(edits, options);
            return { ariaSummary: '', isApplied: true };
        } else {
            return this.workspace.applyBulkEdit(edits, options);
        }
    }

    hasPreviewHandler(): boolean {
        return Boolean(this._previewHandler);
    }

    setPreviewHandler(handler: IBulkEditPreviewHandler): IDisposable {
        this._previewHandler = handler;

        const disposePreviewHandler = () => {
            if (this._previewHandler === handler) {
                this._previewHandler = undefined;
            }
        };

        return {
            dispose(): void {
                disposePreviewHandler();
            }
        };
    }
}
