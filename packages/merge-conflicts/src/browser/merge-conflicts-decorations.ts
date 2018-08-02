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

import { injectable } from 'inversify';
import { OverviewRulerLane, EditorDecoration, EditorDecorationOptions, EditorDecorator } from '@theia/editor/lib/browser';
import { MergeConflictsUpdate } from './merge-conflicts-provider';

@injectable()
export class MergeConflictsDecorations extends EditorDecorator {

    decorate(params: MergeConflictsUpdate): void {
        const mergeConflicts = params.mergeConflicts;
        const newDecorations: EditorDecoration[] = [];
        for (const mergeConflict of mergeConflicts) {
            newDecorations.push({ range: mergeConflict.current.marker!, options: MergeConflictsDecorations.Options.CurrentMarker });
            if (mergeConflict.current.content) {
                newDecorations.push({ range: mergeConflict.current.content!, options: MergeConflictsDecorations.Options.CurrentContent });
            }
            newDecorations.push({ range: mergeConflict.incoming.marker!, options: MergeConflictsDecorations.Options.IncomingMarker });
            if (mergeConflict.incoming.content) {
                newDecorations.push({ range: mergeConflict.incoming.content!, options: MergeConflictsDecorations.Options.IncomingContent });
            }
            for (const base of mergeConflict.bases) {
                if (base.marker) {
                    newDecorations.push({ range: base.marker, options: MergeConflictsDecorations.Options.BaseMarker });
                }
                if (base.content) {
                    newDecorations.push({ range: base.content, options: MergeConflictsDecorations.Options.BaseContent });
                }
            }
        }
        this.setDecorations(params.editor, newDecorations);
    }

}

export namespace MergeConflictsDecorations {

    export const Options = {
        CurrentMarker: <EditorDecorationOptions>{
            isWholeLine: true,
            className: 'merge-conflict-current-marker'
        },
        CurrentContent: <EditorDecorationOptions>{
            isWholeLine: true,
            className: 'merge-conflict-current-content',
            overviewRuler: {
                position: OverviewRulerLane.Full,
                color: 'rgba(0, 255, 0, 0.3)',
            }
        },
        BaseMarker: <EditorDecorationOptions>{
            isWholeLine: true,
            className: 'merge-conflict-base-marker'
        },
        BaseContent: <EditorDecorationOptions>{
            isWholeLine: true,
            className: 'merge-conflict-base-content',
            overviewRuler: {
                position: OverviewRulerLane.Full,
                color: 'rgba(125, 125, 125, 0.3)',
            }
        },
        IncomingMarker: <EditorDecorationOptions>{
            isWholeLine: true,
            className: 'merge-conflict-incoming-marker'
        },
        IncomingContent: <EditorDecorationOptions>{
            isWholeLine: true,
            className: 'merge-conflict-incoming-content',
            overviewRuler: {
                position: OverviewRulerLane.Full,
                color: 'rgba(0, 0, 255, 0.3)',
            }
        },
    };
}
