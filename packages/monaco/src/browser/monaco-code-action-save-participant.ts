// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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

import { CancellationToken } from '@theia/core';
import { SaveOptions, SaveReason } from '@theia/core/lib/browser';
import { MonacoEditor } from './monaco-editor';
import { SaveParticipant, SAVE_PARTICIPANT_DEFAULT_ORDER } from './monaco-editor-provider';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MonacoCodeActionService } from './monaco-code-action-service';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Partially copied from https://github.com/microsoft/vscode/blob/f66e839a38dfe39ee66a86619a790f9c2336d698/src/vs/workbench/contrib/codeEditor/browser/saveParticipants.ts#L272
@injectable()
export class MonacoCodeActionSaveParticipant implements SaveParticipant {
    @inject(MonacoCodeActionService)
    protected readonly codeActionService: MonacoCodeActionService;

    readonly order = SAVE_PARTICIPANT_DEFAULT_ORDER;

    async applyChangesOnSave(editor: MonacoEditor, cancellationToken: CancellationToken, options?: SaveOptions): Promise<void> {
        if (options?.saveReason !== SaveReason.Manual) {
            return undefined;
        }

        await this.codeActionService.applyOnSaveCodeActions(
            editor.document.textEditorModel,
            editor.document.textEditorModel.getLanguageId(),
            editor.document.textEditorModel.uri.toString(),
            cancellationToken
        );
    }

}
