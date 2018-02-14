/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { Diagnostic } from 'vscode-languageserver-types';
import URI from '@theia/core/lib/common/uri';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { TreeWidget } from '@theia/core/lib/browser/tree/tree-widget';
import { TreeDecorator, DecorationData, Color, IconOverlayPosition } from '@theia/core/lib/browser/tree/tree-decorator';
import { Marker } from '../../common/marker';
import { ProblemManager } from './problem-manager';

@injectable()
export class ProblemDecorator implements TreeDecorator {

    readonly id = 'theia-problem-decorator';

    protected readonly emitter: Emitter<Map<string, DecorationData>>;

    constructor(@inject(ProblemManager) protected readonly problemManager: ProblemManager) {
        this.emitter = new Emitter();
        this.problemManager.onDidChangeMarkers(() => {
            this.emitter.fire(new Map(this.getAllMarkers().map(marker => [marker.uri, this.toDecorator(marker)] as [string, DecorationData])));
        });
    }

    get onDidChangeDecorations(): Event<Map<string, DecorationData>> {
        return this.emitter.event;
    }

    isEnabled(treeWidget: TreeWidget): boolean {
        return true;
    }

    protected getAllMarkers(): Marker<Diagnostic>[] {
        return Array.from(this.problemManager.getUris())
            .map(uri => new URI(uri))
            .map(uri => this.problemManager.findMarkers({ uri }))
            .reduce((acc, current) => acc.concat(current), []);
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

    protected getOverlayIconColor(marker: Marker<Diagnostic>): Color | undefined {
        const { severity } = marker.data;
        switch (severity) {
            case 1: return 'var(--theia-error-color0)';
            case 2: return 'var(--theia-warn-color0)';
            case 3: return 'var(--theia-info-color0)';
            default: return undefined;
        }
    }

}
