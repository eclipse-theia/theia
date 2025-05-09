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
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { ILanguageFeaturesService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/languageFeatures';
import { CodeActionKind, CodeActionSet, CodeActionTriggerSource } from '@theia/monaco-editor-core/esm/vs/editor/contrib/codeAction/common/types';
import { applyCodeAction, ApplyCodeActionReason, getCodeActions } from '@theia/monaco-editor-core/esm/vs/editor/contrib/codeAction/browser/codeAction';

import { HierarchicalKind } from '@theia/monaco-editor-core/esm/vs/base/common/hierarchicalKind';
import { EditorPreferences } from '@theia/editor/lib/browser';
import { ITextModel } from '@theia/monaco-editor-core/esm/vs/editor/common/model';
import { CodeActionProvider, CodeActionTriggerType } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import { IProgress } from '@theia/monaco-editor-core/esm/vs/platform/progress/common/progress';
import { IInstantiationService } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';

@injectable()
export class MonacoCodeActionSaveParticipant implements SaveParticipant {
    @inject(EditorPreferences)
    protected readonly editorPreferences: EditorPreferences;

    readonly order = SAVE_PARTICIPANT_DEFAULT_ORDER;

    async applyChangesOnSave(editor: MonacoEditor, cancellationToken: CancellationToken, options?: SaveOptions): Promise<void> {
        // Convert boolean values to strings
        const setting = this.editorPreferences.get({
            preferenceName: 'editor.codeActionsOnSave',
            overrideIdentifier: editor.document.textEditorModel.getLanguageId()
        }, undefined, editor.document.textEditorModel.uri.toString());

        if (!setting) {
            return undefined;
        }

        if (options?.saveReason !== SaveReason.Manual) {
            return undefined;
        }

        const settingItems: string[] = Array.isArray(setting)
            ? setting
            : Object.keys(setting).filter(x => setting[x] && setting[x]);

        const codeActionsOnSave = this.createCodeActionsOnSave(settingItems);

        if (!Array.isArray(setting)) {
            codeActionsOnSave.sort((a, b) => {
                if (CodeActionKind.SourceFixAll.contains(a)) {
                    if (CodeActionKind.SourceFixAll.contains(b)) {
                        return 0;
                    }
                    return -1;
                }
                if (CodeActionKind.SourceFixAll.contains(b)) {
                    return 1;
                }
                return 0;
            });
        }

        if (!codeActionsOnSave.length) {
            return undefined;
        }
        const excludedActions = Array.isArray(setting)
            ? []
            : Object.keys(setting)
                .filter(x => setting[x] === false)
                .map(x => new HierarchicalKind(x));

        await this.applyOnSaveActions(editor.document.textEditorModel, codeActionsOnSave, excludedActions, cancellationToken);
    }

    private createCodeActionsOnSave(settingItems: readonly string[]): HierarchicalKind[] {
        const kinds = settingItems.map(x => new HierarchicalKind(x));

        // Remove subsets
        return kinds.filter(kind => kinds.every(otherKind => otherKind.equals(kind) || !otherKind.contains(kind)));
    }

    private async applyOnSaveActions(model: ITextModel, codeActionsOnSave: readonly HierarchicalKind[],
        excludes: readonly HierarchicalKind[], token: CancellationToken): Promise<void> {

        const instantiationService = StandaloneServices.get(IInstantiationService);

        for (const codeActionKind of codeActionsOnSave) {
            const actionsToRun = await this.getActionsToRun(model, codeActionKind, excludes, token);

            if (token.isCancellationRequested) {
                actionsToRun.dispose();
                return;
            }

            try {
                for (const action of actionsToRun.validActions) {
                    instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.OnSave, {}, token);
                    if (token.isCancellationRequested) {
                        return;
                    }
                }
            } catch {
                // Failure to apply a code action should not block other on save actions
            } finally {
                actionsToRun.dispose();
            }
        }
    }

    private getActionsToRun(model: ITextModel, codeActionKind: HierarchicalKind, excludes: readonly HierarchicalKind[], token: CancellationToken): Promise<CodeActionSet> {
        const { codeActionProvider } = StandaloneServices.get(ILanguageFeaturesService);

        const progress: IProgress<CodeActionProvider> = {
            report(item): void {
                // empty
            },
        };

        return getCodeActions(codeActionProvider, model, model.getFullModelRange(), {
            type: CodeActionTriggerType.Auto,
            triggerAction: CodeActionTriggerSource.OnSave,
            filter: { include: codeActionKind, excludes: excludes, includeSourceActions: true },
        }, progress, token);
    }
}
