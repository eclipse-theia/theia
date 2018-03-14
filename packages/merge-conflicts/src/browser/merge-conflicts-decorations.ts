/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { EditorDecorationsService, OverviewRulerLane, EditorDecoration, EditorDecorationOptions } from "@theia/editor/lib/browser";
import { MergeConflicts } from "./merge-conflicts-provider";

@injectable()
export class MergeConflictsDecorations {

    constructor(
        @inject(EditorDecorationsService) protected readonly decorationsService: EditorDecorationsService,
    ) { }

    decorate(params: MergeConflicts): void {
        const uri = params.uri;
        const mergeConflicts = params.mergeConflicts;
        const newDecorations: EditorDecoration[] = [];
        for (const mergeConflict of mergeConflicts) {
            newDecorations.push({ range: mergeConflict.current.marker!, options: MergeConflictsDecorations.Options.CurrentMarker });
            newDecorations.push({ range: mergeConflict.current.content!, options: MergeConflictsDecorations.Options.CurrentContent });
            newDecorations.push({ range: mergeConflict.incoming.marker!, options: MergeConflictsDecorations.Options.IncomingMarker });
            newDecorations.push({ range: mergeConflict.incoming.content!, options: MergeConflictsDecorations.Options.IncomingContent });
            for (const base of mergeConflict.bases) {
                if (base.marker) {
                    newDecorations.push({ range: base.marker, options: MergeConflictsDecorations.Options.BaseMarker });
                }
                if (base.content) {
                    newDecorations.push({ range: base.content, options: MergeConflictsDecorations.Options.BaseContent });
                }
            }
        }
        this.setDecorations(uri, newDecorations);
    }

    protected setDecorations(uri: string, newDecorations: EditorDecoration[]) {
        const kind = 'merge-conflicts';
        this.decorationsService.setDecorations({ uri, kind, newDecorations });
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
