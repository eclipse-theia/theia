/********************************************************************************
 * Copyright (C) 2018 Google and others.
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

import {
    ApplicationShell, BaseWidget, DockPanel, Navigatable, PanelLayout, Saveable,
    StatefulWidget, Title, Widget, WidgetConstructionOptions, WidgetManager
} from '@theia/core/lib/browser';
import { Emitter, DisposableCollection } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { EditorWidget } from '@theia/editor/lib/browser';
import { Message, MessageLoop } from '@theia/core/shared/@phosphor/messaging';
import { find } from '@theia/core/shared/@phosphor/algorithm';

export interface PreviewViewState {
    pinned: boolean,
    editorState: object | undefined,
    previewDescription: WidgetConstructionOptions | undefined
}

export interface PreviewEditorPinnedEvent {
    preview: EditorPreviewWidget,
    editorWidget: EditorWidget
}

/** The class name added to Editor Preview Widget titles. */
const PREVIEW_TITLE_CLASS = ' theia-editor-preview-title-unpinned';

export class EditorPreviewWidget extends BaseWidget implements ApplicationShell.TrackableWidgetProvider, Navigatable, StatefulWidget {

    protected pinned_: boolean;
    protected pinListeners = new DisposableCollection();
    protected onDidChangeTrackableWidgetsEmitter = new Emitter<Widget[]>();

    private lastParent: DockPanel | undefined;

    readonly onDidChangeTrackableWidgets = this.onDidChangeTrackableWidgetsEmitter.event;

    protected onPinnedEmitter = new Emitter<PreviewEditorPinnedEvent>();

    readonly onPinned = this.onPinnedEmitter.event;

    constructor(protected widgetManager: WidgetManager, protected editorWidget_?: EditorWidget) {
        super();
        this.addClass('theia-editor-preview');
        this.title.closable = true;
        this.title.className += PREVIEW_TITLE_CLASS;
        this.layout = new PanelLayout();
        this.toDispose.push(this.onDidChangeTrackableWidgetsEmitter);
        this.toDispose.push(this.onPinnedEmitter);
        this.toDispose.push(this.pinListeners);
    }

    get editorWidget(): EditorWidget | undefined {
        return this.editorWidget_;
    }

    get pinned(): boolean {
        return this.pinned_;
    }

    get saveable(): Saveable | undefined {
        if (this.editorWidget_) {
            return this.editorWidget_.saveable;
        }
    }

    getResourceUri(): URI | undefined {
        return this.editorWidget_ && this.editorWidget_.getResourceUri();
    }
    createMoveToUri(resourceUri: URI): URI | undefined {
        return this.editorWidget_ && this.editorWidget_.createMoveToUri(resourceUri);
    }

    pinEditorWidget(): void {
        this.title.className = this.title.className.replace(PREVIEW_TITLE_CLASS, '');
        this.pinListeners.dispose();
        this.pinned_ = true;
        this.onPinnedEmitter.fire({ preview: this, editorWidget: this.editorWidget_! });
    }

    replaceEditorWidget(editorWidget: EditorWidget): void {
        if (editorWidget === this.editorWidget_) {
            return;
        }
        if (this.editorWidget_) {
            this.editorWidget_.dispose();
        }
        this.editorWidget_ = editorWidget;
        this.attachPreviewWidget(this.editorWidget_);
        this.onResize(Widget.ResizeMessage.UnknownSize);
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        if (this.editorWidget_) {
            this.editorWidget_.activate();
        }
    }

    protected attachPreviewWidget(w: Widget): void {
        (this.layout as PanelLayout).addWidget(w);
        this.title.label = w.title.label;
        this.title.iconClass = w.title.iconClass;
        this.title.caption = w.title.caption;

        if (Saveable.isSource(w)) {
            Saveable.apply(this);
            const dirtyListener = w.saveable.onDirtyChanged(() => {
                dirtyListener.dispose();
                this.pinEditorWidget();
            });
            this.toDispose.push(dirtyListener);
        }
        w.parent = this;
        this.onDidChangeTrackableWidgetsEmitter.fire([w]);
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (this.editorWidget_ && !this.editorWidget_.isAttached) {
            this.attachPreviewWidget(this.editorWidget_);
        }
        this.addTabPinningLogic();
    }

    protected addTabPinningLogic(): void {
        const parent = this.parent;
        if (!this.pinned_ && parent instanceof DockPanel) {
            if (!this.lastParent) {
                this.lastParent = parent;
            }

            const tabBar = find(parent.tabBars(), bar => bar.titles.indexOf(this.title) !== -1);

            // Widget has been dragged into a different panel
            if (this.lastParent !== parent || !tabBar) {
                this.pinEditorWidget();
                return;
            }

            const layoutListener = (panel: DockPanel) => {
                if (tabBar !== find(panel.tabBars(), bar => bar.titles.indexOf(this.title) !== -1)) {
                    this.pinEditorWidget();
                }
            };
            parent.layoutModified.connect(layoutListener);
            this.pinListeners.push({ dispose: () => parent.layoutModified.disconnect(layoutListener) });

            const tabMovedListener = (w: Widget, args: { title: Title<Widget> }) => {
                if (args.title === this.title) {
                    this.pinEditorWidget();
                }
            };
            tabBar.tabMoved.connect(tabMovedListener);
            this.pinListeners.push({ dispose: () => tabBar.tabMoved.disconnect(tabMovedListener) });

            const attachDoubleClickListener = (attempt: number): number | undefined => {
                const tabNode = tabBar.contentNode.children.item(tabBar.currentIndex);
                if (!tabNode) {
                    return attempt < 60 ? requestAnimationFrame(() => attachDoubleClickListener(++attempt)) : undefined;
                }
                const dblClickListener = (event: Event) => this.pinEditorWidget();
                tabNode.addEventListener('dblclick', dblClickListener);
                this.pinListeners.push({ dispose: () => tabNode.removeEventListener('dblclick', dblClickListener) });
            };
            requestAnimationFrame(() => attachDoubleClickListener(0));
        }
    }

    protected onResize(msg: Widget.ResizeMessage): void {
        if (this.editorWidget_) {
            // Currently autosizing does not work with the Monaco Editor Widget
            // https://github.com/eclipse-theia/theia/blob/c86a33b9ee0e5bb1dc49c66def123ffb2cadbfe4/packages/monaco/src/browser/monaco-editor.ts#L461
            // After this is supported we can rely on the underlying widget to resize and remove
            // the following if statement. (Without it, the editor will be initialized to its
            // minimum size)
            if (msg.width < 0 || msg.height < 0) {
                const width = parseInt(this.node.style.width || '');
                const height = parseInt(this.node.style.height || '');
                if (width && height) {
                    this.editorWidget_.editor.setSize({ width, height });
                }
            }
            MessageLoop.sendMessage(this.editorWidget_, msg);
        }
    }

    getTrackableWidgets(): Widget[] {
        return this.editorWidget_ ? [this.editorWidget_] : [];
    }

    storeState(): PreviewViewState {
        return {
            pinned: this.pinned_,
            editorState: this.editorWidget_ ? this.editorWidget_.storeState() : undefined,
            previewDescription: this.editorWidget_ ? this.widgetManager.getDescription(this.editorWidget_) : undefined
        };
    }

    async restoreState(state: PreviewViewState): Promise<void> {
        const { pinned, editorState, previewDescription } = state;
        if (!this.editorWidget_ && previewDescription) {
            const { factoryId, options } = previewDescription;
            const editorWidget = await this.widgetManager.getOrCreateWidget(factoryId, options) as EditorWidget;
            this.replaceEditorWidget(editorWidget);
        }
        if (this.editorWidget && editorState) {
            this.editorWidget.restoreState(editorState);
        }
        if (pinned) {
            this.pinEditorWidget();
        }
    }
}
