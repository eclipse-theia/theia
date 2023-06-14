// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Diagnostic, DiagnosticSeverity } from '@theia/core/shared/vscode-languageserver-protocol';
import URI from '@theia/core/lib/common/uri';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { Tree, TreeNode } from '@theia/core/lib/browser/tree/tree';
import { DepthFirstTreeIterator } from '@theia/core/lib/browser/tree/tree-iterator';
import { TreeDecorator, TreeDecoration } from '@theia/core/lib/browser/tree/tree-decorator';
import { FileStatNode } from '@theia/filesystem/lib/browser';
import { Marker } from '../../common/marker';
import { ProblemManager } from './problem-manager';
import { ProblemPreferences } from './problem-preferences';
import { ProblemUtils } from './problem-utils';
import { LabelProvider } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';

/**
 * @deprecated since 1.25.0
 * URI-based decorators should implement `DecorationsProvider` and contribute decorations via the `DecorationsService`.
 */
@injectable()
export class ProblemDecorator implements TreeDecorator {

    @inject(ProblemPreferences)
    protected problemPreferences: ProblemPreferences;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

    readonly id = 'theia-problem-decorator';

    protected readonly emitter: Emitter<(tree: Tree) => Map<string, TreeDecoration.Data>>;

    constructor(@inject(ProblemManager) protected readonly problemManager: ProblemManager) {
        this.emitter = new Emitter();
        this.problemManager.onDidChangeMarkers(() => this.fireDidChangeDecorations((tree: Tree) => this.collectDecorators(tree)));
    }

    @postConstruct()
    protected init(): void {
        this.problemPreferences.onPreferenceChanged(event => {
            if (event.preferenceName === 'problems.decorations.enabled') {
                this.fireDidChangeDecorations(tree => this.collectDecorators(tree));
            }
        });
        this.workspaceService.onWorkspaceChanged(() => {
            this.fireDidChangeDecorations((tree: Tree) => this.collectDecorators(tree));
        });
        this.workspaceService.onWorkspaceLocationChanged(() => {
            this.fireDidChangeDecorations((tree: Tree) => this.collectDecorators(tree));
        });
    }

    async decorations(tree: Tree): Promise<Map<string, TreeDecoration.Data>> {
        return this.collectDecorators(tree);
    }

    get onDidChangeDecorations(): Event<(tree: Tree) => Map<string, TreeDecoration.Data>> {
        return this.emitter.event;
    }

    protected fireDidChangeDecorations(event: (tree: Tree) => Map<string, TreeDecoration.Data>): void {
        this.emitter.fire(event);
    }

    protected collectDecorators(tree: Tree): Map<string, TreeDecoration.Data> {
        const decorations = new Map<string, TreeDecoration.Data>();
        // If the tree root is undefined or the preference for the decorations is disabled, return an empty result map.
        if (!tree.root || !this.problemPreferences['problems.decorations.enabled']) {
            return decorations;
        }
        const baseDecorations = this.collectMarkers(tree);
        for (const node of new DepthFirstTreeIterator(tree.root)) {
            const nodeUri = this.getUriFromNode(node);
            if (nodeUri) {
                const decorator = baseDecorations.get(nodeUri);
                if (decorator) {
                    this.appendContainerMarkers(node, decorator, decorations);
                }
                if (decorator) {
                    decorations.set(node.id, decorator);
                }
            }
        }
        return decorations;
    }

    protected generateCaptionSuffix(nodeURI: URI): string {
        const workspaceRoots = this.workspaceService.tryGetRoots();
        const parentWorkspace = this.workspaceService.getWorkspaceRootUri(nodeURI);
        let workspacePrefixString = '';
        let separator = '';
        let filePathString = '';
        const nodeURIDir = nodeURI.parent;
        if (parentWorkspace) {
            const relativeDirFromWorkspace = parentWorkspace.relative(nodeURIDir);
            workspacePrefixString = workspaceRoots.length > 1 ? this.labelProvider.getName(parentWorkspace) : '';
            filePathString = relativeDirFromWorkspace?.fsPath() ?? '';
            separator = filePathString && workspacePrefixString ? ' \u2022 ' : ''; // add a bullet point between workspace and path
        } else {
            workspacePrefixString = nodeURIDir.path.fsPath();
        }
        return `${workspacePrefixString}${separator}${filePathString}`;
    }

    /**
     * Traverses up the tree from the given node and attaches decorations to any parents.
     */
    protected appendContainerMarkers(node: TreeNode, decoration: TreeDecoration.Data, decorations: Map<string, TreeDecoration.Data>): void {
        let parent = node?.parent;
        while (parent) {
            const existing = decorations.get(parent.id);
            // Make sure the highest diagnostic severity (smaller number) will be propagated to the container directory.
            if (existing === undefined || this.compareDecorators(existing, decoration) < 0) {
                decorations.set(parent.id, decoration);
                parent = parent.parent;
            } else {
                break;
            }
        }
    }

    /**
     * @returns a map matching stringified URI's to a decoration whose features reflect the highest-severity problem found
     * and the number of problems found (based on {@link ProblemDecorator.toDecorator })
     */
    protected collectMarkers(tree: Tree): Map<string, TreeDecoration.Data> {
        const decorationsForUri = new Map();
        const compare = this.compare.bind(this);
        const filter = this.filterMarker.bind(this);
        for (const [, markers] of this.problemManager.getMarkersByUri()) {
            const relevant = markers.findMarkers({}).filter(filter).sort(compare);
            if (relevant.length) {
                decorationsForUri.set(relevant[0].uri, this.toDecorator(relevant));
            }
        }
        return decorationsForUri;
    }

    protected toDecorator(markers: Marker<Diagnostic>[]): TreeDecoration.Data {
        const color = this.getColor(markers[0]);
        const priority = this.getPriority(markers[0]);
        return {
            priority,
            fontData: {
                color,
            },
            tailDecorations: [{
                color,
                data: markers.length.toString(),
            }],
        };
    }

    protected getColor(marker: Marker<Diagnostic>): TreeDecoration.Color {
        const { severity } = marker.data;
        switch (severity) {
            case 1: return 'var(--theia-list-errorForeground)';
            case 2: return 'var(--theia-list-warningForeground)';
            default: return 'var(--theia-successBackground)';
        }
    }

    /**
     * Get the decoration for a given marker diagnostic.
     * Markers with higher severity have a higher priority and should be displayed.
     * @param marker the diagnostic marker.
     */
    protected getPriority(marker: Marker<Diagnostic>): number {
        const { severity } = marker.data;
        switch (severity) {
            case 1: return 30; // Errors.
            case 2: return 20; // Warnings.
            case 3: return 10; // Infos.
            default: return 0;
        }
    }

    /**
     * Returns `true` if the diagnostic (`data`) of the marker argument has `Error`, `Warning`, or `Information` severity.
     * Otherwise, returns `false`.
     */
    protected filterMarker(marker: Marker<Diagnostic>): boolean {
        const { severity } = marker.data;
        return severity === DiagnosticSeverity.Error
            || severity === DiagnosticSeverity.Warning
            || severity === DiagnosticSeverity.Information;
    }

    protected getUriFromNode(node: TreeNode): string | undefined {
        return FileStatNode.getUri(node);
    }

    protected compare(left: Marker<Diagnostic>, right: Marker<Diagnostic>): number {
        return ProblemDecorator.severityCompare(left, right);
    }

    protected compareDecorators(left: TreeDecoration.Data, right: TreeDecoration.Data): number {
        return TreeDecoration.Data.comparePriority(left, right);
    }
}

export namespace ProblemDecorator {

    // Highest severities (errors) come first, then the others. Undefined severities treated as the last ones.
    export const severityCompare = ProblemUtils.severityCompareMarker;

}
