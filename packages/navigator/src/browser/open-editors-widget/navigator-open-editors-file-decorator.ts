/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { TreeDecorator, TreeDecoration } from '@theia/core/lib/browser/tree/tree-decorator';
import { Emitter } from '@theia/core/lib/common/event';
import { Tree } from '@theia/core/lib/browser/tree/tree';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    ApplicationShell,
    DepthFirstTreeIterator,
    FrontendApplication,
    FrontendApplicationContribution,
    LabelProvider,
    NavigatableWidget,
    Saveable,
    Widget,
    WidgetManager
} from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { OpenEditorNode } from './navigator-open-editors-tree-model';
import { Disposable } from '@theia/core/lib/common';
import { TheiaDockPanel } from '@theia/core/lib/browser/shell/theia-dock-panel';

@injectable()
export class OpenEditorsFileDecorator implements TreeDecorator, FrontendApplicationContribution {
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(WidgetManager) protected readonly widgetManager: WidgetManager;

    protected shell: ApplicationShell;
    readonly id = 'theia-open-editors-file-decorator';
    protected decorationsMap = new Map<string, TreeDecoration.Data>();

    protected readonly decorationsChangedEmitter = new Emitter();
    readonly onDidChangeDecorations = this.decorationsChangedEmitter.event;
    protected readonly toDisposeOnDirtyChanged = new Map<string, Disposable>();

    onDidInitializeLayout(app: FrontendApplication): void {
        this.shell = app.shell;
        this.workspaceService.onWorkspaceChanged(() => {
            this.fireDidChangeDecorations((tree: Tree) => this.collectDecorators(tree));
        });
        this.workspaceService.onWorkspaceLocationChanged(() => {
            this.fireDidChangeDecorations((tree: Tree) => this.collectDecorators(tree));
        });

        this.shell.onDidAddWidget(widget => this.registerSaveableListener(widget));
        this.shell.onDidRemoveWidget(widget => this.toDisposeOnDirtyChanged.get(widget.id)?.dispose());
        this.editorWidgets.forEach(widget => this.registerSaveableListener(widget));
    }

    protected registerSaveableListener(widget: Widget): void {
        const saveable = Saveable.get(widget);
        const isTrackableProvider = ApplicationShell.TrackableWidgetProvider.is(widget);
        if (saveable && !isTrackableProvider) {
            this.toDisposeOnDirtyChanged.set(widget.id, saveable.onDirtyChanged(() => {
                this.fireDidChangeDecorations((tree: Tree) => this.collectDecorators(tree));
            }));
        }
    }

    protected get editorWidgets(): NavigatableWidget[] {
        return this.shell.widgets.filter((widget): widget is NavigatableWidget => NavigatableWidget.is(widget));
    }

    protected fireDidChangeDecorations(event: (tree: Tree) => Promise<Map<string, TreeDecoration.Data>>): void {
        this.decorationsChangedEmitter.fire(event);
    }

    async decorations(tree: Tree): Promise<Map<string, TreeDecoration.Data>> {
        return this.collectDecorators(tree);
    }

    // Add workspace root as caption suffix and italicize if PreviewWidget
    protected async collectDecorators(tree: Tree): Promise<Map<string, TreeDecoration.Data>> {
        const result = new Map<string, TreeDecoration.Data>();
        if (tree.root === undefined) {
            return result;
        }
        for (const node of new DepthFirstTreeIterator(tree.root)) {
            if (OpenEditorNode.is(node)) {
                const isPreviewWidget = !(node.widget.parent instanceof TheiaDockPanel);
                const workspaceAndPath = await this.generateCaptionSuffix(node.uri);
                const decorations: TreeDecoration.Data = {
                    captionSuffixes: [
                        {
                            data: workspaceAndPath,
                            fontData: { style: isPreviewWidget ? 'italic' : undefined }
                        }
                    ],
                    fontData: { style: isPreviewWidget ? 'italic' : undefined }
                };
                result.set(node.id, decorations);
            }
        }
        return result;
    }

    protected async generateCaptionSuffix(nodeURI: URI): Promise<string> {
        const workspaceRoots = await this.workspaceService.roots;
        const parentWorkspace = this.workspaceService.getWorkspaceRootUri(nodeURI);
        if (parentWorkspace) {
            const relativePathURI = parentWorkspace.relative(nodeURI)?.dir;
            const workspacePrefixString = workspaceRoots.length > 1 ? this.labelProvider.getName(parentWorkspace) : '';
            const filePathString = relativePathURI?.hasDir ? relativePathURI.toString() : '';
            const separator = filePathString && workspacePrefixString ? ' \u2022 ' : ''; // add a bullet point between workspace and path
            return `${workspacePrefixString}${separator}${filePathString}`;
        }
        return '';
    }
}
