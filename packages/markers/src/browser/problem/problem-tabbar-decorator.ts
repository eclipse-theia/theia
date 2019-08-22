/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';
import URI from '@theia/core/lib/common/uri';
import { notEmpty } from '@theia/core/lib/common/objects';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { Title, Widget } from '@phosphor/widgets';
import { WidgetDecoration } from '@theia/core/lib/browser/widget-decoration';
import { TabBarDecorator } from '@theia/core/lib/browser/shell/tab-bar-decorator';
import { Marker } from '../../common/marker';
import { ProblemManager } from './problem-manager';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ProblemPreferences, ProblemConfiguration } from './problem-preferences';
import { PreferenceChangeEvent } from '@theia/core/lib/browser';
@injectable()
export class ProblemTabBarDecorator implements TabBarDecorator {

    readonly id = 'theia-problem-tabbar-decorator';

    protected emitter: Emitter<void>;

    @inject(ProblemPreferences)
    protected readonly preferences: ProblemPreferences;

    @inject(ProblemManager)
    protected readonly problemManager: ProblemManager;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @postConstruct()
    protected init(): void {
        this.emitter = new Emitter();
        this.problemManager.onDidChangeMarkers(() => this.fireDidChangeDecorations());
        this.preferences.onPreferenceChanged(event => this.handlePreferenceChange(event));
    }

    decorate(titles: Title<Widget>[]): Map<string, WidgetDecoration.Data> {
        return this.collectDecorators(titles);
    }

    get onDidChangeDecorations(): Event<void> {
        return this.emitter.event;
    }

    protected fireDidChangeDecorations(): void {
        this.emitter.fire(undefined);
    }

    /**
     * Handle changes in preference.
     * @param {PreferenceChangeEvent<ProblemConfiguration>} event The event of the changes in preference.
     */
    protected async handlePreferenceChange(event: PreferenceChangeEvent<ProblemConfiguration>): Promise<void> {
        const { preferenceName } = event;
        if (preferenceName === 'problems.decorations.tabbar.enabled') {
            this.fireDidChangeDecorations();
        }
    }

    /**
     * Collect decorators for the tabs.
     * @returns {Map<string, TabBarDecoration.Data>} A map from the tab URI to the tab decoration data.
     */
    protected collectDecorators(titles: Title<Widget>[]): Map<string, WidgetDecoration.Data> {
        const result: Map<string, Marker<Diagnostic>> = new Map();
        if (this.preferences['problems.decorations.tabbar.enabled']) {
            const markers = this.groupMarkersByURI(this.collectMarkers());
            for (const title of titles) {
                // Ensure `title.caption` does not contain illegal characters for URI.
                try {
                    const fileUri: URI = new URI(title.caption);
                    const marker = markers.get(fileUri.withScheme('file').toString());
                    if (marker) {
                        result.set(title.caption, marker);
                    }
                } catch (e) {
                }
            }
        }
        const urlDecoratorMap = new Map(Array.from(result.entries())
            .map(entry => [entry[0], this.toDecorator(entry[1])] as [string, WidgetDecoration.Data]));
        return urlDecoratorMap;
    }

    /**
     * Group markers by the URI of the editor they decorate.
     * @param {Marker<Diagnostic>[]} markers All the diagnostic markers collected.
     * @returns {Map<string, Marker<Diagnostic>>} A map from URI of the editor to its diagnostic markers.
     */
    protected groupMarkersByURI(markers: Marker<Diagnostic>[]): Map<string, Marker<Diagnostic>> {
        const result: Map<string, Marker<Diagnostic>> = new Map();
        for (const [uri, marker] of new Map(markers.map(m => [new URI(m.uri), m] as [URI, Marker<Diagnostic>])).entries()) {
            const uriString = uri.toString();
            result.set(uriString, marker);
        }
        return result;
    }

    /**
     * Collect all diagnostic markers from the problem manager.
     * @returns {Marker<Diagnostic>[]} An array of diagnostic markers.
     */
    protected collectMarkers(): Marker<Diagnostic>[] {
        return Array.from(this.problemManager.getUris())
            .map(str => new URI(str))
            .map(uri => this.problemManager.findMarkers({ uri }))
            .map(markers => markers.sort(this.compare.bind(this)).shift())
            .filter(notEmpty)
            .filter(this.filterMarker.bind(this));
    }

    /**
     * Convert a diagnostic marker to a decorator.
     * @param {Marker<Diagnostic>} marker A diagnostic marker.
     * @returns {WidgetDecoration.Data} The decoration data.
     */
    protected toDecorator(marker: Marker<Diagnostic>): WidgetDecoration.Data {
        const position = WidgetDecoration.IconOverlayPosition.BOTTOM_RIGHT;
        const icon = this.getOverlayIcon(marker);
        const color = this.getOverlayIconColor(marker);
        return {
            iconOverlay: {
                position,
                icon,
                color,
                background: {
                    shape: 'circle',
                    color: 'var(--theia-layout-color0)'
                }
            }
        };
    }

    /**
     * Get the appropriate overlay icon for decoration.
     * @param {Marker<Diagnostic>} marker A diagnostic marker.
     * @returns {string} A string representing the overlay icon class.
     */
    protected getOverlayIcon(marker: Marker<Diagnostic>): string {
        const { severity } = marker.data;
        switch (severity) {
            case 1: return 'times-circle';
            case 2: return 'exclamation-circle';
            case 3: return 'info-circle';
            default: return 'hand-o-up';
        }
    }

    /**
     * Get the appropriate overlay icon color for decoration.
     * @param {Marker<Diagnostic>} marker A diagnostic marker.
     * @returns {WidgetDecoration.Color} The decoration color.
     */
    protected getOverlayIconColor(marker: Marker<Diagnostic>): WidgetDecoration.Color {
        const { severity } = marker.data;
        switch (severity) {
            case 1: return 'var(--theia-error-color0)';
            case 2: return 'var(--theia-warn-color0)';
            case 3: return 'var(--theia-info-color0)';
            default: return 'var(--theia-success-color0)';
        }
    }

    /**
     * Filter the diagnostic marker by its severity.
     * @param {Marker<Diagnostic>} marker A diagnostic marker.
     * @returns {boolean} Whether the diagnostic marker is of `Error`, `Warning`, or `Information` severity.
     */
    protected filterMarker(marker: Marker<Diagnostic>): boolean {
        const { severity } = marker.data;
        return severity === DiagnosticSeverity.Error
            || severity === DiagnosticSeverity.Warning
            || severity === DiagnosticSeverity.Information;
    }

    /**
     * Compare the severity of two diagnostic markers.
     * @param {Marker<Diagnostic>} left A diagnostic marker to be compared.
     * @param {Marker<Diagnostic>} right A diagnostic marker to be compared.
     * @returns {number} Number indicating which marker takes priority (`left` if negative, `right` if positive).
     */
    protected compare(left: Marker<Diagnostic>, right: Marker<Diagnostic>): number {
        return (left.data.severity || Number.MAX_SAFE_INTEGER) - (right.data.severity || Number.MAX_SAFE_INTEGER);
    }
}
