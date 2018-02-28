/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { EditorDecorationsService, OverviewRulerLane, Range, EditorDecoration, EditorDecorationOptions } from "@theia/editor/lib/browser";
import { MergeConflictUpdateParams } from "./merge-conflicts-service";

@injectable()
export class MergeConflictsDecorations {

    constructor(
        @inject(EditorDecorationsService) protected readonly decorationsService: EditorDecorationsService,
    ) { }

    onMergeConflictUpdate(params: MergeConflictUpdateParams): void {
        const uri = params.uri;
        const mergeConflicts = params.mergeConflicts;
        this.setDecorations(uri, MergeConflictsDecorations.Kind.CurrentMarker, mergeConflicts.map(c => c.current.marker!));
        this.setDecorations(uri, MergeConflictsDecorations.Kind.CurrentContent, mergeConflicts.map(c => c.current.content!));
        this.setDecorations(uri, MergeConflictsDecorations.Kind.IncomingMarker, mergeConflicts.map(c => c.incoming.marker!));
        this.setDecorations(uri, MergeConflictsDecorations.Kind.IncomingContent, mergeConflicts.map(c => c.incoming.content!));

        const baseMarkerRanges: Range[] = [];
        const baseContentRanges: Range[] = [];
        mergeConflicts.forEach(c => c.bases.forEach(b => {
            if (b.marker) {
                baseMarkerRanges.push(b.marker);
            }
            if (b.content) {
                baseContentRanges.push(b.content);
            }
        }));
        this.setDecorations(uri, MergeConflictsDecorations.Kind.BaseMarker, baseMarkerRanges);
        this.setDecorations(uri, MergeConflictsDecorations.Kind.BaseContent, baseContentRanges);
    }

    protected setDecorations(uri: string, kind: MergeConflictsDecorations.Kind, ranges: Range[]) {
        const options = MergeConflictsDecorations.Options[kind];
        const newDecorations = ranges.map(range => <EditorDecoration>{ range, options });
        this.decorationsService.setDecorations({ uri, kind, newDecorations });
    }

}

export namespace MergeConflictsDecorations {

    export enum Kind {
        CurrentMarker = 'merge-conflict-current-marker',
        CurrentContent = 'merge-conflict-current-content',
        BaseMarker = 'merge-conflict-base-marker',
        BaseContent = 'merge-conflict-base-content',
        IncomingMarker = 'merge-conflict-incoming-marker',
        IncomingContent = 'merge-conflict-incoming-content',
    }

    export const Options = {
        [Kind.CurrentMarker]: <EditorDecorationOptions>{
            isWholeLine: true,
            className: Kind.CurrentMarker.toString()
        },
        [Kind.CurrentContent]: <EditorDecorationOptions>{
            isWholeLine: true,
            className: Kind.CurrentContent.toString(),
            overviewRuler: {
                position: OverviewRulerLane.Full,
                color: 'rgba(0, 255, 0, 0.3)',
            }
        },
        [Kind.BaseMarker]: <EditorDecorationOptions>{
            isWholeLine: true,
            className: Kind.BaseMarker.toString()
        },
        [Kind.BaseContent]: <EditorDecorationOptions>{
            isWholeLine: true,
            className: Kind.BaseContent.toString(),
            overviewRuler: {
                position: OverviewRulerLane.Full,
                color: 'rgba(125, 125, 125, 0.3)',
            }
        },
        [Kind.IncomingMarker]: <EditorDecorationOptions>{
            isWholeLine: true,
            className: Kind.IncomingMarker.toString()
        },
        [Kind.IncomingContent]: <EditorDecorationOptions>{
            isWholeLine: true,
            className: Kind.IncomingContent.toString(),
            overviewRuler: {
                position: OverviewRulerLane.Full,
                color: 'rgba(0, 0, 255, 0.3)',
            }
        },
    };
}
