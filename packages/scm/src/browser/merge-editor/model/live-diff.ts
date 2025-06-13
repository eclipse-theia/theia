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
// copied and modified from https://github.com/microsoft/vscode/blob/1.96.3/src/vs/workbench/contrib/mergeEditor/browser/model/textModelDiffs.ts

import { Disposable, DisposableCollection, URI } from '@theia/core';
import { Autorun, Observable, ObservableSignal, SettableObservable } from '@theia/core/lib/common/observable';
import { DiffComputer, LineRange as DiffLineRange } from '@theia/core/lib/common/diff';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { DetailedLineRangeMapping, RangeMapping } from './range-mapping';
import { LineRange } from './line-range';

export class LiveDiff implements Disposable {

    protected recomputeCount = 0;
    protected readonly stateObservable = SettableObservable.create(LiveDiffState.Initializing);
    protected readonly changesObservable = SettableObservable.create<readonly DetailedLineRangeMapping[]>([]);
    protected readonly toDispose = new DisposableCollection();

    constructor(
        protected readonly originalDocument: MonacoEditorModel,
        protected readonly modifiedDocument: MonacoEditorModel,
        protected readonly diffComputer: DiffComputer
    ) {
        const recomputeSignal = ObservableSignal.create();

        this.toDispose.push(Autorun.create(() => {
            recomputeSignal.get();
            this.recompute();
        }));

        this.toDispose.push(originalDocument.onDidChangeContent(
            () => recomputeSignal.trigger()
        ));
        this.toDispose.push(modifiedDocument.onDidChangeContent(
            () => recomputeSignal.trigger()
        ));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get state(): LiveDiffState {
        return this.stateObservable.get();
    }

    get changes(): readonly DetailedLineRangeMapping[] {
        return this.changesObservable.get();
    }

    protected recompute(): void {
        const recomputeCount = ++this.recomputeCount;

        if (this.stateObservable.getUntracked() !== LiveDiffState.Initializing) { // untracked to avoid an infinite change loop in the autorun
            this.stateObservable.set(LiveDiffState.Updating);
        }

        this.diffComputer.computeDiff(new URI(this.originalDocument.uri), new URI(this.modifiedDocument.uri)).then(diff => {
            if (this.toDispose.disposed || this.originalDocument.isDisposed() || this.modifiedDocument.isDisposed()) {
                return;
            }

            if (recomputeCount !== this.recomputeCount) {
                // There is a newer recompute call
                return;
            }

            const toLineRange = (r: DiffLineRange) => new LineRange(r.start, r.end - r.start);
            const changes = diff?.changes.map(change => new DetailedLineRangeMapping(
                toLineRange(change.left),
                this.originalDocument,
                toLineRange(change.right),
                this.modifiedDocument,
                change.innerChanges?.map(innerChange => new RangeMapping(innerChange.left, innerChange.right))
            ));

            Observable.update(() => {
                if (changes) {
                    this.stateObservable.set(LiveDiffState.UpToDate);
                    this.changesObservable.set(changes);
                } else {
                    this.stateObservable.set(LiveDiffState.Error);
                }
            });
        });
    }
}

export const enum LiveDiffState {
    Initializing,
    UpToDate,
    Updating,
    Error
}
