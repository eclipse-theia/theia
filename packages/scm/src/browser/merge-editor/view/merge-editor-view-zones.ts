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

import { inject, injectable } from '@theia/core/shared/inversify';
import { Disposable } from '@theia/core';
import { Autorun, Observable } from '@theia/core/lib/common/observable';
import * as monaco from '@theia/monaco-editor-core';
import { MonacoEditorViewZone } from '@theia/monaco/lib/browser/monaco-editor-zone-widget';
import { MergeEditor } from '../merge-editor';
import { MergeRange } from '../model/merge-range';
import { MergeRangeAction, MergeRangeActions } from './merge-range-actions';
import { MergeEditorPane } from './merge-editor-panes';
import { DiffSpacers, DiffSpacerService } from './diff-spacers';

export interface MergeEditorViewZone {
    create(ctx: MergeEditorViewZone.CreationContext): void;
}

export namespace MergeEditorViewZone {
    export interface CreationContext {
        createViewZone(viewZone: Omit<MonacoEditorViewZone, 'id'>): void;
        register(disposable: Disposable): void;
    }
}

export interface MergeEditorViewZones {
    readonly baseViewZones: readonly MergeEditorViewZone[];
    readonly side1ViewZones: readonly MergeEditorViewZone[];
    readonly side2ViewZones: readonly MergeEditorViewZone[];
    readonly resultViewZones: readonly MergeEditorViewZone[];
}

@injectable()
export class MergeEditorViewZoneComputer {

    @inject(DiffSpacerService)
    protected readonly diffSpacerService: DiffSpacerService;

    computeViewZones(mergeEditor: MergeEditor): MergeEditorViewZones {

        const baseViewZones: MergeEditorViewZone[] = [];
        const side1ViewZones: MergeEditorViewZone[] = [];
        const side2ViewZones: MergeEditorViewZone[] = [];
        const resultViewZones: MergeEditorViewZone[] = [];

        const { model, shouldAlignResult, shouldAlignBase } = mergeEditor;

        for (const mergeRange of model.mergeRanges) {
            const { side1Pane, side2Pane, resultPane } = mergeEditor;

            const actions = this.newMergeRangeActions(mergeEditor, mergeRange);

            let resultActionZoneHeight = this.getActionZoneMinHeight(resultPane);
            if (actions.hasSideActions || (shouldAlignResult && actions.hasResultActions)) {
                let actionZoneHeight = Math.max(this.getActionZoneMinHeight(side1Pane), this.getActionZoneMinHeight(side2Pane));
                if (shouldAlignResult) {
                    resultActionZoneHeight = actionZoneHeight = Math.max(actionZoneHeight, resultActionZoneHeight);
                }
                side1ViewZones.push(this.newActionZone(side1Pane, actions.side1ActionsObservable, mergeRange.side1Range.startLineNumber - 1, actionZoneHeight));
                side2ViewZones.push(this.newActionZone(side2Pane, actions.side2ActionsObservable, mergeRange.side2Range.startLineNumber - 1, actionZoneHeight));
                if (shouldAlignBase) {
                    baseViewZones.push(this.newActionZonePlaceholder(mergeRange.baseRange.startLineNumber - 1, actionZoneHeight));
                }
            }
            if (actions.hasResultActions) {
                resultViewZones.push(
                    this.newActionZone(resultPane, actions.resultActionsObservable, model.getLineRangeInResult(mergeRange).startLineNumber - 1, resultActionZoneHeight)
                );
            } else if (shouldAlignResult && actions.hasSideActions) {
                resultViewZones.push(this.newActionZonePlaceholder(model.getLineRangeInResult(mergeRange).startLineNumber - 1, resultActionZoneHeight));
            }
        }

        const baseLineCount = model.baseDocument.lineCount;
        const multiDiffSpacers: DiffSpacers[] = [];

        multiDiffSpacers.push(this.diffSpacerService.computeDiffSpacers(model.side1Changes, baseLineCount));
        multiDiffSpacers.push(this.diffSpacerService.computeDiffSpacers(model.side2Changes, baseLineCount));

        if (shouldAlignResult) {
            multiDiffSpacers.push(this.diffSpacerService.computeDiffSpacers(model.resultChanges, baseLineCount));
        }

        const combinedMultiDiffSpacers = this.diffSpacerService.combineMultiDiffSpacers(multiDiffSpacers);

        if (shouldAlignBase) {
            this.createSpacerZones(combinedMultiDiffSpacers.originalSpacers, baseViewZones);
        }

        const { modifiedSides } = shouldAlignBase ? combinedMultiDiffSpacers : this.diffSpacerService.excludeOriginalSide(combinedMultiDiffSpacers);

        this.createSpacerZones(modifiedSides[0].modifiedSpacers, side1ViewZones);
        this.createSpacerZones(modifiedSides[1].modifiedSpacers, side2ViewZones);

        if (shouldAlignResult) {
            this.createSpacerZones(modifiedSides[2].modifiedSpacers, resultViewZones);
        }

        return { baseViewZones, side1ViewZones, side2ViewZones, resultViewZones };
    }

    protected createSpacerZones(spacers: number[], viewZones: MergeEditorViewZone[]): void {
        const lineNumbers = Object.keys(spacers).map(Number); // note: spacers is a sparse array
        for (const lineNumber of lineNumbers) {
            const heightInLines = spacers[lineNumber];
            if (heightInLines) {
                viewZones.push(this.newSpacerZone(lineNumber - 1, heightInLines));
            }
        }
    }

    protected newMergeRangeActions(mergeEditor: MergeEditor, mergeRange: MergeRange): MergeRangeActions {
        return new MergeRangeActions(mergeEditor, mergeRange);
    }

    protected getActionZoneMinHeight(pane: MergeEditorPane): number {
        return pane.editor.getControl().getOption(monaco.editor.EditorOption.lineHeight);
    }

    protected newActionZone(pane: MergeEditorPane, actions: Observable<readonly MergeRangeAction[]>, afterLineNumber: number, heightInPx: number): MergeEditorViewZone {
        return new MergeEditorActionZone(pane, actions, afterLineNumber, heightInPx);
    }

    protected newActionZonePlaceholder(afterLineNumber: number, heightInPx: number): MergeEditorViewZone {
        return new MergeEditorActionZonePlaceholder(afterLineNumber, heightInPx);
    }

    protected newSpacerZone(afterLineNumber: number, heightInLines: number): MergeEditorViewZone {
        return new MergeEditorSpacerZone(afterLineNumber, heightInLines);
    }
}

export class MergeEditorActionZone implements MergeEditorViewZone {

    protected static counter = 0;

    constructor(
        protected readonly pane: MergeEditorPane,
        protected readonly actionsObservable: Observable<readonly MergeRangeAction[]>,
        protected readonly afterLineNumber: number,
        protected readonly heightInPx: number
    ) {}

    create(ctx: MergeEditorViewZone.CreationContext): void {
        const overlayWidgetNode = document.createElement('div');
        overlayWidgetNode.className = 'action-zone';

        ctx.createViewZone({
            domNode: document.createElement('div'),
            afterLineNumber: this.afterLineNumber + 1, // + 1, since line numbers in Monaco are 1-based
            heightInPx: this.heightInPx,
            onComputedHeight: height => overlayWidgetNode.style.height = `${height}px`,
            onDomNodeTop: top => overlayWidgetNode.style.top = `${top}px`
        });

        const editor = this.pane.editor.getControl();
        const setLeftPosition = () => overlayWidgetNode.style.left = editor.getLayoutInfo().contentLeft + 'px';
        setLeftPosition();
        ctx.register(editor.onDidLayoutChange(setLeftPosition));

        const overlayWidgetId = `mergeEditorActionZone${MergeEditorActionZone.counter++}`;
        const overlayWidget = {
            getId: () => overlayWidgetId,
            getDomNode: () => overlayWidgetNode,
            // eslint-disable-next-line no-null/no-null
            getPosition: () => null
        };
        editor.addOverlayWidget(overlayWidget);
        ctx.register(Disposable.create(() => {
            editor.removeOverlayWidget(overlayWidget);
        }));

        const actionContainer = document.createElement('div');
        actionContainer.className = 'codelens-decoration';
        overlayWidgetNode.appendChild(actionContainer);

        ctx.register(Autorun.create(() => this.renderActions(actionContainer, this.actionsObservable.get())));
    };

    protected renderActions(parent: HTMLElement, actions: readonly MergeRangeAction[]): void {
        const children: HTMLElement[] = [];
        let isFirst = true;
        for (const action of actions) {
            if (isFirst) {
                isFirst = false;
            } else {
                const actionSeparator = document.createElement('span');
                actionSeparator.append('\u00a0|\u00a0');
                children.push(actionSeparator);
            }
            const title = this.getActionTitle(action);
            if (action.run) {
                const actionLink = document.createElement('a');
                actionLink.role = 'button';
                actionLink.onclick = () => action.run!();
                if (action.tooltip) {
                    actionLink.title = action.tooltip;
                }
                actionLink.append(title);
                children.push(actionLink);
            } else {
                const actionLabel = document.createElement('span');
                if (action.tooltip) {
                    actionLabel.title = action.tooltip;
                }
                actionLabel.append(title);
                children.push(actionLabel);
            }
        }
        parent.innerText = ''; // reset children
        parent.append(...children);
    }

    protected getActionTitle(action: MergeRangeAction): string {
        return action.text;
    }
}

export class MergeEditorActionZonePlaceholder implements MergeEditorViewZone {
    constructor(
        protected readonly afterLineNumber: number,
        protected readonly heightInPx: number
    ) {}

    create(ctx: MergeEditorViewZone.CreationContext): void {
        const domNode = document.createElement('div');
        domNode.className = 'action-zone-placeholder';
        ctx.createViewZone({
            afterLineNumber: this.afterLineNumber + 1, // + 1, since line numbers in Monaco are 1-based
            heightInPx: this.heightInPx,
            domNode
        });
    }
}

export class MergeEditorSpacerZone implements MergeEditorViewZone {
    constructor(
        protected readonly afterLineNumber: number,
        protected readonly heightInLines: number
    ) { }

    create(ctx: MergeEditorViewZone.CreationContext): void {
        const domNode = document.createElement('div');
        domNode.className = 'diagonal-fill';
        ctx.createViewZone({
            afterLineNumber: this.afterLineNumber + 1, // + 1, since line numbers in Monaco are 1-based
            heightInLines: this.heightInLines,
            domNode
        });
    }
}
