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

import { injectable } from '@theia/core/shared/inversify';
import { nls } from '@theia/core';
import { ACTION_ITEM, codicon, ConfirmDialog, Dialog, DISABLED_CLASS } from '@theia/core/lib/browser';
import { ObservableUtils } from '@theia/core/lib/common/observable';
import { EditorDecoration, Range } from '@theia/editor/lib/browser';
import { MergeEditorPane } from './merge-editor-pane';
import { MergeEditorPaneToolbarItem } from './merge-editor-pane-header';
import { LineRange } from '../../model/line-range';
import { MergeRange } from '../../model/merge-range';

@injectable()
export class MergeEditorResultPane extends MergeEditorPane {

    constructor() {
        super();
        this.addClass('result');
    }

    protected override initContextKeys(): void {
        super.initContextKeys();
        this.editor.getControl().createContextKey('isMergeResultEditor', true);
    }

    override getLineRangeForMergeRange(mergeRange: MergeRange): LineRange {
        return this.mergeEditor.model.getLineRangeInResult(mergeRange);
    }

    protected override translateBaseRange(range: Range): Range {
        return this.mergeEditor.model.translateBaseRangeToResult(range);
    }

    protected goToNextUnhandledMergeRange(): void {
        this.mergeEditor.goToNextMergeRange(mergeRange => !this.mergeEditor.model.isMergeRangeHandled(mergeRange));
        this.mergeEditor.activate();
    }

    reset(): void {
        new ConfirmDialog({
            title: nls.localize('theia/scm/mergeEditor/resetConfirmationTitle', 'Do you really want to reset the merge result in this editor?'),
            msg: nls.localize('theia/scm/mergeEditor/resetConfirmationMessage', 'This action cannot be undone.'),
            ok: Dialog.YES,
            cancel: Dialog.NO,
        }).open().then(async confirmed => {
            if (confirmed) {
                this.activate();
                const { model } = this.mergeEditor;
                await model.reset();
                await ObservableUtils.waitForState(model.isUpToDateObservable);
                this.mergeEditor.goToFirstMergeRange(mergeRange => !model.isMergeRangeHandled(mergeRange));
            }
        }).catch(e => console.error(e));
    }

    protected override getToolbarItems(): MergeEditorPaneToolbarItem[] {
        const { model } = this.mergeEditor;
        const { unhandledMergeRangesCount } = model;
        return [
            {
                id: 'nextConflict',
                label: unhandledMergeRangesCount === 1 ?
                    nls.localizeByDefault('{0} Conflict Remaining', unhandledMergeRangesCount) :
                    nls.localizeByDefault('{0} Conflicts Remaining ', unhandledMergeRangesCount),
                tooltip: unhandledMergeRangesCount ?
                    nls.localizeByDefault('Go to next conflict') :
                    nls.localizeByDefault('All conflicts handled, the merge can be completed now.'),
                className: ACTION_ITEM + (unhandledMergeRangesCount ? '' : ' ' + DISABLED_CLASS),
                onClick: unhandledMergeRangesCount ?
                    () => this.goToNextUnhandledMergeRange() :
                    undefined
            },
            {
                id: 'reset',
                tooltip: nls.localizeByDefault('Reset'),
                className: codicon('discard', true),
                onClick: () => this.reset()
            }
        ];
    }

    protected override computeEditorDecorations(): EditorDecoration[] {
        const result: EditorDecoration[] = [];

        const { model, currentMergeRange } = this.mergeEditor;

        for (const mergeRange of model.mergeRanges) {
            if (mergeRange) {
                const lineRange = model.getLineRangeInResult(mergeRange);
                result.push(this.toMergeRangeDecoration(lineRange, {
                    isHandled: model.isMergeRangeHandled(mergeRange),
                    isFocused: mergeRange === currentMergeRange,
                    isAfterEnd: lineRange.startLineNumber > model.resultDocument.lineCount,
                }));
            }
        }

        result.push(...this.toChangeDecorations(model.resultChanges, { diffSide: 'modified' }));
        return result;
    }
}
