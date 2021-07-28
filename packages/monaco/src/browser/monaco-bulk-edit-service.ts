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

import { injectable, inject } from '@theia/core/shared/inversify';
import { MonacoWorkspace } from './monaco-workspace';

@injectable()
export class MonacoBulkEditService implements monaco.editor.IBulkEditService {

    @inject(MonacoWorkspace)
    protected readonly workspace: MonacoWorkspace;

    private _previewHandler?: monaco.editor.IBulkEditPreviewHandler;

    async apply(edits: monaco.editor.ResourceEdit[], options?: monaco.editor.IBulkEditOptions): Promise<monaco.editor.IBulkEditResult & { success: boolean }> {
        if (this._previewHandler && (options?.showPreview || edits.some(value => value.metadata?.needsConfirmation))) {
            edits = await this._previewHandler(edits, options);
            return { ariaSummary: '', success: true };
        } else {
            return this.workspace.applyBulkEdit(edits);
        }
    }

    hasPreviewHandler(): boolean {
        return Boolean(this._previewHandler);
    }

    setPreviewHandler(handler: monaco.editor.IBulkEditPreviewHandler): monaco.IDisposable {
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
