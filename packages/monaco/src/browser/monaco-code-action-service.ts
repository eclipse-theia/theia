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

export const MonacoCodeActionService = Symbol('MonacoCodeActionService');

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Partially copied from https://github.com/microsoft/vscode/blob/f66e839a38dfe39ee66a86619a790f9c2336d698/src/vs/workbench/contrib/codeEditor/browser/saveParticipants.ts#L272

export interface MonacoCodeActionService {
    /**
     * Gets all code actions that should be applied on save for the given model and language identifier.
     * @param model The text model to get code actions for
     * @param languageId The language identifier for preference lookup
     * @param uri The URI string for preference scoping
     * @param token Cancellation token
     * @returns Array of code action sets to apply, or undefined if no actions should be applied
     */
    getAllCodeActionsOnSave(model: ITextModel, languageId: string, uri: string, token: CancellationToken): Promise<CodeActionSet[] | undefined>;

    /**
     * Applies the provided code actions for the given model.
     * @param model The text model to apply code actions to
     * @param codeActionSets Array of code action sets to apply
     * @param token Cancellation token
     */
    applyCodeActions(model: ITextModel, codeActionSets: CodeActionSet[], token: CancellationToken): Promise<void>;

    /**
     * Applies all code actions that should be run on save for the given model and language identifier.
     * This is a convenience method that retrieves all on-save code actions and applies them.
     * @param model The text model to apply code actions to
     * @param languageId The language identifier for preference lookup
     * @param uri The URI string for preference scoping
     * @param token Cancellation token
     */
    applyOnSaveCodeActions(model: ITextModel, languageId: string, uri: string, token: CancellationToken): Promise<void>;
}

@injectable()
export class MonacoCodeActionServiceImpl implements MonacoCodeActionService {
    @inject(EditorPreferences)
    protected readonly editorPreferences: EditorPreferences;

    async applyOnSaveCodeActions(model: ITextModel, languageId: string, uri: string, token: CancellationToken): Promise<void> {
        const codeActionSets = await this.getAllCodeActionsOnSave(model, languageId, uri, token);

        if (!codeActionSets || token.isCancellationRequested) {
            return;
        }

        await this.applyCodeActions(model, codeActionSets, token);
    }

    async getAllCodeActionsOnSave(model: ITextModel, languageId: string, uri: string, token: CancellationToken): Promise<CodeActionSet[] | undefined> {
        const setting = this.editorPreferences.get({
            preferenceName: 'editor.codeActionsOnSave',
            overrideIdentifier: languageId
        }, undefined, uri);

        if (!setting) {
            return undefined;
        }

        const settingItems: string[] = Array.isArray(setting)
            ? setting
            : Object.keys(setting).filter(x => setting[x]);

        const codeActionsOnSave = this.createCodeActionsOnSave(settingItems);

        if (!codeActionsOnSave.length) {
            return undefined;
        }

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

        const excludedActions = Array.isArray(setting)
            ? []
            : Object.keys(setting)
                .filter(x => setting[x] === false)
                .map(x => new HierarchicalKind(x));

        const codeActionSets: CodeActionSet[] = [];

        for (const codeActionKind of codeActionsOnSave) {
            const actionsToRun = await this.getActionsToRun(model, codeActionKind, excludedActions, token);

            if (token.isCancellationRequested) {
                actionsToRun.dispose();
                break;
            }

            codeActionSets.push(actionsToRun);
        }

        return codeActionSets;
    }

    async applyCodeActions(model: ITextModel, codeActionSets: CodeActionSet[], token: CancellationToken): Promise<void> {

        const instantiationService = StandaloneServices.get(IInstantiationService);

        for (const codeActionSet of codeActionSets) {
            if (token.isCancellationRequested) {
                codeActionSet.dispose();
                return;
            }

            try {
                for (const action of codeActionSet.validActions) {
                    await instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.OnSave, {}, token);
                    if (token.isCancellationRequested) {
                        return;
                    }
                }
            } catch {
                // Failure to apply a code action should not block other on save actions
            } finally {
                codeActionSet.dispose();
            }
        }
    }

    private createCodeActionsOnSave(settingItems: readonly string[]): HierarchicalKind[] {
        const kinds = settingItems.map(x => new HierarchicalKind(x));

        // Remove subsets
        return kinds.filter(kind => kinds.every(otherKind => otherKind.equals(kind) || !otherKind.contains(kind)));
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
