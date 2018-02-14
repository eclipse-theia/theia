/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { Diagnostic } from 'vscode-languageserver-types';
import URI from '@theia/core/lib/common/uri';
import { notEmpty } from '@theia/core/lib/common/utils';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { TreeDecorator, DecorationData, Color, IconOverlayPosition } from '@theia/core/lib/browser/tree/tree-decorator';
import { Marker } from '../../common/marker';
import { ProblemManager } from './problem-manager';

@injectable()
export class ProblemDecorator implements TreeDecorator {

    readonly id = 'theia-problem-decorator';

    protected readonly emitter: Emitter<Map<string, DecorationData>>;

    constructor(@inject(ProblemManager) protected readonly problemManager: ProblemManager) {
        this.emitter = new Emitter();
        this.problemManager.onDidChangeMarkers(() => this.fireDidChangeDecorations(this.collectDecorators()));
    }

    get onDidChangeDecorations(): Event<Map<string, DecorationData>> {
        return this.emitter.event;
    }

    protected fireDidChangeDecorations(event: Map<string, DecorationData>): void {
        this.emitter.fire(event);
    }

    protected collectDecorators(): Map<string, DecorationData> {
        const markers = this.appendContainerMarkers(this.collectMarkers());
        return new Map(markers.map(m => [m.uri, this.toDecorator(m)] as [string, DecorationData]));
    }

    protected appendContainerMarkers(markers: Marker<Diagnostic>[]): Marker<Diagnostic>[] {
        const result: Map<string, Marker<Diagnostic>> = new Map();
        // We traverse up and assign the diagnostic to the container directory.
        // Note, instead of stopping at the WS root, we traverse up the driver root. If there are any markers that are outside of the WS will be ignored anyway.
        for (const [uri, marker] of new Map(markers.map(m => [new URI(m.uri), m] as [URI, Marker<Diagnostic>])).entries()) {
            const uriString = uri.toString();
            result.set(uriString, marker);
            let parentUri: URI | undefined = uri.parent;
            while (parentUri && !parentUri.path.isRoot) {
                const parentUriString = parentUri.toString();
                const existing = result.get(parentUriString);
                // Make sure the highest diagnostic severity (smaller number) will be propagated to the container directory.
                if (existing === undefined || severityCompare(existing, marker) < 0) {
                    result.set(parentUriString, {
                        data: marker.data,
                        uri: parentUriString,
                        owner: marker.owner,
                        kind: marker.kind
                    });
                    parentUri = parentUri.parent;
                } else {
                    parentUri = undefined;
                }
            }
        }
        return Array.from(result.values());

    }

    protected collectMarkers(): Marker<Diagnostic>[] {
        return Array.from(this.problemManager.getUris())
            .map(uri => new URI(uri))
            .map(uri => this.problemManager.findMarkers({ uri }))
            .map(markers => markers.sort(severityCompare))
            .map(markers => markers.shift())
            .filter(notEmpty);
    }

    protected toDecorator(marker: Marker<Diagnostic>): DecorationData {
        const position = IconOverlayPosition.BOTTOM_RIGHT;
        const icon = this.getOverlayIcon(marker);
        const color = this.getOverlayIconColor(marker);
        return {
            iconOverlay: {
                position,
                icon,
                color
            }
        };
    }

    protected getOverlayIcon(marker: Marker<Diagnostic>): string {
        const { severity } = marker.data;
        switch (severity) {
            case 1: return 'times-circle';
            case 2: return 'exclamation-circle';
            case 3: return 'info-circle';
            default: return 'hand-o-up';
        }
    }

    protected getOverlayIconColor(marker: Marker<Diagnostic>): Color {
        const { severity } = marker.data;
        switch (severity) {
            case 1: return 'var(--theia-error-color0)';
            case 2: return 'var(--theia-warn-color0)';
            case 3: return 'var(--theia-info-color0)';
            default: return 'var(--theia-success-color0)';
        }
    }

}

// Highest severities (errors) come first, then the others. Undefined severities treated as the last ones.
const severityCompare = (left: Marker<Diagnostic>, right: Marker<Diagnostic>): number =>
    (left.data.severity || Number.MAX_SAFE_INTEGER) - (right.data.severity || Number.MAX_SAFE_INTEGER);
