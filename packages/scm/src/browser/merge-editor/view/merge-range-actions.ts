// *****************************************************************************
// Copyright (C) 2025 1C-Soft LLC and others.
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
// copied and modified from https://github.com/microsoft/vscode/blob/1.96.3/src/vs/workbench/contrib/mergeEditor/browser/view/conflictActions.ts

import { DerivedObservable, ObservableUtils } from '@theia/core/lib/common/observable';
import { MergeRange, MergeRangeAcceptedState, MergeSide } from '../model/merge-range';
import { MergeEditor } from '../merge-editor';
import { nls } from '@theia/core';

export interface MergeRangeAction {
    readonly text: string;
    readonly tooltip?: string;
    run?(): unknown;
}

export class MergeRangeActions {

    readonly side1ActionsObservable = DerivedObservable.create(() => this.getActionsForSide(1));
    readonly side2ActionsObservable = DerivedObservable.create(() => this.getActionsForSide(2));
    readonly resultActionsObservable = DerivedObservable.create(() => this.getResultActions());

    protected readonly hasSideActionsObservable = DerivedObservable.create(() => this.side1ActionsObservable.get().length + this.side2ActionsObservable.get().length > 0);
    get hasSideActions(): boolean { return this.hasSideActionsObservable.get(); }

    protected readonly hasResultActionsObservable = DerivedObservable.create(() => this.resultActionsObservable.get().length > 0);
    get hasResultActions(): boolean { return this.hasResultActionsObservable.get(); }

    constructor(
        protected readonly mergeEditor: MergeEditor,
        protected readonly mergeRange: MergeRange
    ) {}

    protected getActionsForSide(side: MergeSide): readonly MergeRangeAction[] {
        const { mergeEditor, mergeRange } = this;
        const { model, side1Title, side2Title } = mergeEditor;

        if (!model.hasMergeRange(mergeRange)) {
            return [];
        }

        const result: MergeRangeAction[] = [];
        const sideTitle = side === 1 ? side1Title : side2Title;
        const state = model.getMergeRangeResultState(mergeRange);

        if (state !== 'Unrecognized' && !state.includes('Side' + side)) {
            if (state !== 'Base' || mergeRange.getChanges(side).length) {
                result.push({
                    text: nls.localizeByDefault('Accept {0}', sideTitle),
                    tooltip: nls.localizeByDefault('Accept {0} in the result document.', sideTitle),
                    run: () => this.applyMergeRangeAcceptedState(mergeRange, MergeRangeAcceptedState.addSide(state, side))
                });
            }

            if (mergeRange.canBeSmartCombined(side)) {
                result.push({
                    text: mergeRange.isSmartCombinationOrderRelevant ?
                        nls.localizeByDefault('Accept Combination ({0} First)', sideTitle) :
                        nls.localizeByDefault('Accept Combination'),
                    tooltip: nls.localizeByDefault('Accept an automatic combination of both sides in the result document.'),
                    run: () => this.applyMergeRangeAcceptedState(mergeRange, MergeRangeAcceptedState.addSide(
                        side === 1 ? 'Side1' : 'Side2', side === 1 ? 2 : 1, { smartCombination: true }))
                });
            }
        }
        return result;
    }

    protected getResultActions(): readonly MergeRangeAction[] {
        const { mergeEditor, mergeRange } = this;
        const { model, side1Title, side2Title } = mergeEditor;

        if (!model.hasMergeRange(mergeRange)) {
            return [];
        }

        const result: MergeRangeAction[] = [];
        const state = model.getMergeRangeResultState(mergeRange);

        if (state === 'Unrecognized') {
            result.push({
                text: nls.localizeByDefault('Manual Resolution'),
                tooltip: nls.localizeByDefault('This conflict has been resolved manually.')
            });
            result.push({
                text: nls.localizeByDefault('Reset to base'),
                tooltip: nls.localizeByDefault('Reset this conflict to the common ancestor of both the right and left changes.'),
                run: () => this.applyMergeRangeAcceptedState(mergeRange, 'Base')
            });
        } else if (state === 'Base') {
            result.push({
                text: nls.localizeByDefault('No Changes Accepted'),
                tooltip: nls.localizeByDefault('The current resolution of this conflict equals the common ancestor of both the right and left changes.')
            });
            if (!model.isMergeRangeHandled(mergeRange)) {
                result.push({
                    text: nls.localizeByDefault('Mark as Handled'),
                    run: () => this.applyMergeRangeAcceptedState(mergeRange, state)
                });
            }
        } else {
            const labels: string[] = [];
            const stateToggles: MergeRangeAction[] = [];
            if (state.includes('Side1')) {
                labels.push(side1Title);
                stateToggles.push({
                    text: nls.localizeByDefault('Remove {0}', side1Title),
                    tooltip: nls.localizeByDefault('Remove {0} from the result document.', side1Title),
                    run: () => this.applyMergeRangeAcceptedState(mergeRange, MergeRangeAcceptedState.removeSide(state, 1))
                });
            }
            if (state.includes('Side2')) {
                labels.push(side2Title);
                stateToggles.push({
                    text: nls.localizeByDefault('Remove {0}', side2Title),
                    tooltip: nls.localizeByDefault('Remove {0} from the result document.', side2Title),
                    run: () => this.applyMergeRangeAcceptedState(mergeRange, MergeRangeAcceptedState.removeSide(state, 2))
                });
            }
            if (state.startsWith('Side2')) {
                labels.reverse();
                stateToggles.reverse();
            }
            if (labels.length) {
                result.push({
                    text: labels.join(' + ')
                });
            }
            result.push(...stateToggles);
        }
        return result;
    }

    protected async applyMergeRangeAcceptedState(mergeRange: MergeRange, state: MergeRangeAcceptedState): Promise<void> {
        const { model, resultPane } = this.mergeEditor;
        resultPane.activate();
        await ObservableUtils.waitForState(model.isUpToDateObservable);
        resultPane.goToMergeRange(mergeRange, { reveal: false }); // set the cursor state that will be restored when undoing the operation
        model.applyMergeRangeAcceptedState(mergeRange, state);
        await ObservableUtils.waitForState(model.isUpToDateObservable);
        resultPane.goToMergeRange(mergeRange, { reveal: false }); // set the resulting cursor state
    }
}
