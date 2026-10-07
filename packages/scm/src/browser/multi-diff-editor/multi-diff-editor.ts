// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { Emitter, Event, isObject, nls, URI } from '@theia/core';
import {
    ApplicationShell, BaseWidget, BoxLayout, codicon, Key, LabelProvider, LabelProviderContribution,
    Message, MessageLoop, Navigatable, NavigatableWidgetOpenHandler, Panel, PanelLayout, StatefulWidget,
    Widget, WidgetOpenerOptions
} from '@theia/core/lib/browser';
import { EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoDiffEditor } from '@theia/monaco/lib/browser/monaco-diff-editor';
import { MultiDiffEditorUri, MultiDiffEditorResourcePair, MultiDiffEditorUriData } from './multi-diff-editor-uri';

export { MultiDiffEditorUri, MultiDiffEditorResourcePair, MultiDiffEditorUriData };

export interface MultiDiffEditorOpenerOptions extends WidgetOpenerOptions {
    reveal?: URI;
}

/**
 * Data required to construct a {@link MultiDiffEditor} via dependency injection.
 */
export const MultiDiffEditorData = Symbol('MultiDiffEditorData');

/**
 * Minimum height of a diff entry (in pixels). Ensures loading placeholders and
 * small files still have a reasonable presence when scrolling the list of entries.
 */
export const MIN_ENTRY_HEIGHT = 120;
/**
 * Maximum height of a diff entry (in pixels). Prevents a single large file
 * from dominating the view; content beyond this height is scrollable within
 * the embedded editor.
 */
export const MAX_ENTRY_HEIGHT = 500;
/**
 * Height of the header bar above each embedded diff editor (in pixels).
 * Used as the collapsed-entry height and as the sizeBasis of the BoxLayout header child.
 */
export const HEADER_HEIGHT = 28;

/**
 * Legacy persisted state of a {@link MultiDiffEditor}. New multi-diff tabs opt out
 * of layout persistence because resource providers may not be available on restore.
 */
export interface MultiDiffEditorState {
    scrollTop?: number;
    collapsedUris?: string[];
}

export namespace MultiDiffEditorState {
    export function is(value: unknown): value is MultiDiffEditorState {
        if (!isObject<MultiDiffEditorState>(value)) {
            return false;
        }
        if (value.scrollTop !== undefined && typeof value.scrollTop !== 'number') {
            return false;
        }
        if (value.collapsedUris !== undefined
            && (!Array.isArray(value.collapsedUris) || !value.collapsedUris.every(u => typeof u === 'string'))) {
            return false;
        }
        return true;
    }
}

/**
 * Header widget for a single diff entry. Displays a collapse/expand toggle, file icon,
 * name and path. Clicking anywhere on the header fires {@link onDidToggleCollapse}.
 */
export class DiffEntryHeaderWidget extends BaseWidget {

    protected readonly onDidToggleCollapseEmitter = new Emitter<void>();
    readonly onDidToggleCollapse: Event<void> = this.onDidToggleCollapseEmitter.event;

    protected readonly chevron: HTMLElement;

    constructor(resource: MultiDiffEditorResourcePair, labelProvider: LabelProvider) {
        super();
        this.addClass('multi-diff-entry-header');
        this.node.setAttribute('role', 'button');
        this.node.setAttribute('aria-expanded', 'true');
        this.node.tabIndex = 0;

        this.chevron = document.createElement('span');
        this.chevron.className = `${codicon('chevron-down')} multi-diff-entry-chevron`;
        this.node.appendChild(this.chevron);

        const icon = document.createElement('span');
        icon.className = `${labelProvider.getIcon(resource.modifiedUri)} file-icon multi-diff-entry-icon`;
        this.node.appendChild(icon);

        const label = document.createElement('span');
        label.classList.add('multi-diff-entry-label');
        label.textContent = labelProvider.getName(resource.modifiedUri);
        this.node.appendChild(label);

        const description = document.createElement('span');
        description.classList.add('multi-diff-entry-description');
        description.textContent = labelProvider.getLongName(resource.modifiedUri);
        this.node.appendChild(description);

        this.toDispose.push(this.onDidToggleCollapseEmitter);
        this.addEventListener(this.node, 'click', () => this.onDidToggleCollapseEmitter.fire());
        this.addKeyListener(this.node, [Key.ENTER, Key.SPACE], () => this.onDidToggleCollapseEmitter.fire());
    }

    setCollapsed(collapsed: boolean): void {
        this.node.setAttribute('aria-expanded', String(!collapsed));
        this.chevron.classList.toggle('codicon-chevron-down', !collapsed);
        this.chevron.classList.toggle('codicon-chevron-right', collapsed);
    }
}

/**
 * Placeholder widget shown while a diff entry's editor is being loaded.
 */
export class DiffEntryLoadingWidget extends BaseWidget {

    constructor() {
        super();
        this.addClass('multi-diff-entry-loading');
        const spinner = document.createElement('span');
        spinner.className = `${codicon('loading')} codicon-modifier-spin`;
        this.node.appendChild(spinner);
        const text = document.createElement('span');
        text.textContent = nls.localizeByDefault('Loading...');
        this.node.appendChild(text);
    }
}

/**
 * Placeholder widget shown when a diff entry's editor fails to load.
 */
export class DiffEntryErrorWidget extends BaseWidget {

    constructor(message: string, retry?: () => void) {
        super();
        this.addClass('multi-diff-entry-error');
        const icon = document.createElement('span');
        icon.className = codicon('error');
        this.node.appendChild(icon);
        const text = document.createElement('span');
        text.textContent = message;
        this.node.appendChild(text);
        if (retry) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'theia-button';
            button.textContent = nls.localizeByDefault('Retry');
            this.node.appendChild(button);
            this.addEventListener(button, 'click', retry);
        }
    }
}

/**
 * A single diff entry combining a header and a content area that transitions through
 * loading, editor, and error states. The entry's outer height is controlled via
 * {@link DiffEntryWidget.setHeight} and, once the editor is loaded, tracks the
 * editor's content size up to {@link MAX_ENTRY_HEIGHT}. The entry can be collapsed
 * (showing only the header) via {@link DiffEntryWidget.setCollapsed}.
 */
export class DiffEntryWidget extends BaseWidget {

    readonly modifiedUri: URI;

    protected readonly boxLayout: BoxLayout;
    protected readonly header: DiffEntryHeaderWidget;
    protected currentContent: Widget;
    protected _editorWidget?: EditorWidget;

    protected _isCollapsed = false;
    /** Height to restore when expanding from a collapsed state. */
    protected lastExpandedHeight = MIN_ENTRY_HEIGHT;
    protected availableHeight?: number;
    protected loading = false;
    protected loadAttempted = false;

    protected readonly onDidLoadEditorEmitter = new Emitter<void>();
    readonly onDidLoadEditor: Event<void> = this.onDidLoadEditorEmitter.event;

    protected readonly onDidChangeCollapsedEmitter = new Emitter<boolean>();
    readonly onDidChangeCollapsed: Event<boolean> = this.onDidChangeCollapsedEmitter.event;

    constructor(
        resource: MultiDiffEditorResourcePair,
        headerWidget: DiffEntryHeaderWidget,
        protected readonly createEditor?: () => Promise<EditorWidget>
    ) {
        super();
        this.addClass('multi-diff-entry');
        this.modifiedUri = resource.modifiedUri;
        this.header = headerWidget;

        this.boxLayout = new BoxLayout({ direction: 'top-to-bottom', spacing: 0 });
        BoxLayout.setStretch(headerWidget, 0);
        BoxLayout.setSizeBasis(headerWidget, HEADER_HEIGHT);
        this.boxLayout.addWidget(headerWidget);

        this.currentContent = new DiffEntryLoadingWidget();
        BoxLayout.setStretch(this.currentContent, 1);
        this.boxLayout.addWidget(this.currentContent);

        this.layout = this.boxLayout;
        this.setHeight(MIN_ENTRY_HEIGHT);

        this.toDispose.pushAll([
            this.onDidChangeCollapsedEmitter,
            this.onDidLoadEditorEmitter,
            this.header.onDidToggleCollapse(() => this.setCollapsed(!this._isCollapsed))
        ]);
    }

    get editorWidget(): EditorWidget | undefined {
        return this._editorWidget;
    }

    get isCollapsed(): boolean {
        return this._isCollapsed;
    }

    setCollapsed(collapsed: boolean): void {
        if (this._isCollapsed === collapsed) {
            return;
        }
        this._isCollapsed = collapsed;
        this.header.setCollapsed(collapsed);
        this.currentContent.setHidden(collapsed);
        if (collapsed) {
            this.lastExpandedHeight = this.getCurrentHeight() || MIN_ENTRY_HEIGHT;
            this.setNodeHeight(HEADER_HEIGHT);
        } else {
            this.setNodeHeight(this.lastExpandedHeight);
        }
        this.onDidChangeCollapsedEmitter.fire(collapsed);
        if (!collapsed) {
            this.loadEditor();
        }
    }

    async loadEditor(retry = false): Promise<void> {
        if (this.isDisposed || this._isCollapsed || this._editorWidget || this.loading || (!retry && this.loadAttempted) || !this.createEditor) {
            return;
        }
        this.loading = true;
        this.loadAttempted = true;
        this.replaceContent(new DiffEntryLoadingWidget());
        try {
            const editorWidget = await this.createEditor();
            if (this.isDisposed) {
                editorWidget.dispose();
                return;
            }
            this.setEditor(editorWidget);
            this.onDidLoadEditorEmitter.fire();
        } catch (error) {
            if (!this.isDisposed) {
                const message = error instanceof Error ? error.message : String(error);
                this.setError(nls.localize('theia/scm/multiDiffEditor/loadFailed', 'Failed to load diff: {0}', message));
            }
        } finally {
            this.loading = false;
        }
    }

    setError(message: string): void {
        this.replaceContent(new DiffEntryErrorWidget(message, () => this.loadEditor(true)));
    }

    setEditor(editorWidget: EditorWidget): void {
        this._editorWidget = editorWidget;
        this.replaceContent(editorWidget);
        this.trackContentHeight(editorWidget);
    }

    /**
     * Replace the current content widget (loading/editor/error) with a new one.
     * Using BoxLayout directly (instead of a nested Panel) ensures that Monaco's
     * container gets explicit `position: absolute` + `width`/`height` from Lumino's
     * LayoutItem, which is required for Monaco to lay out correctly.
     */
    protected replaceContent(widget: Widget): void {
        const old = this.currentContent;
        if (old === widget) {
            return;
        }
        widget.setHidden(this._isCollapsed);
        BoxLayout.setStretch(widget, 1);
        this.boxLayout.addWidget(widget);
        this.currentContent = widget;
        // eslint-disable-next-line no-null/no-null
        old.parent = null;
        old.dispose();
    }

    /**
     * Set the outer height of this entry to fit its content. The value is clamped between
     * {@link MIN_ENTRY_HEIGHT} and {@link MAX_ENTRY_HEIGHT}. Has no effect while the entry
     * is collapsed; the requested height is remembered and applied on expand.
     */
    setHeight(height: number): void {
        const clamped = this.availableHeight ?? Math.max(MIN_ENTRY_HEIGHT, Math.min(MAX_ENTRY_HEIGHT, height));
        this.lastExpandedHeight = clamped;
        if (!this._isCollapsed) {
            this.setNodeHeight(clamped);
        }
    }

    /** Let a single entry fill the viewport instead of applying the multi-entry height limit. */
    setAvailableHeight(height: number): void {
        this.availableHeight = Math.max(HEADER_HEIGHT, height);
        this.setHeight(height);
    }

    protected getCurrentHeight(): number {
        const parsed = parseInt(this.node.style.height, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    protected setNodeHeight(height: number): void {
        if (this.node.style.height === `${height}px`) {
            return;
        }
        this.node.style.height = `${height}px`;
        if (this.isAttached) {
            MessageLoop.sendMessage(this, Widget.ResizeMessage.UnknownSize);
        }
    }

    /**
     * Subscribe to the embedded editor's content size changes and size this entry accordingly.
     * The subscriptions are disposed together with this widget.
     */
    protected trackContentHeight(editorWidget: EditorWidget): void {
        const monacoEditor = MonacoEditor.get(editorWidget);
        if (!monacoEditor) {
            return;
        }
        const getContentHeight = (): number => {
            if (monacoEditor instanceof MonacoDiffEditor) {
                return Math.max(
                    monacoEditor.diffEditor.getOriginalEditor().getContentHeight(),
                    monacoEditor.diffEditor.getModifiedEditor().getContentHeight()
                );
            }
            return monacoEditor.getControl().getContentHeight();
        };
        const updateHeight = () => this.setHeight(getContentHeight() + HEADER_HEIGHT);
        if (monacoEditor instanceof MonacoDiffEditor) {
            this.toDispose.push(monacoEditor.diffEditor.getOriginalEditor().onDidContentSizeChange(updateHeight));
            this.toDispose.push(monacoEditor.diffEditor.getModifiedEditor().onDidContentSizeChange(updateHeight));
        } else {
            this.toDispose.push(monacoEditor.getControl().onDidContentSizeChange(updateHeight));
        }
        updateHeight();
    }
}

/**
 * Widget that displays a list of diff editors stacked vertically.
 *
 * **Async-loading contract:** the widget is returned immediately by the factory with
 * placeholder entries (one per resource) showing a loading indicator. Each
 * {@link DiffEntryWidget.editorWidget} is `undefined` until the embedded diff editor
 * finishes loading, at which point the placeholder is replaced and
 * {@link onDidChangeTrackableWidgets} fires so the {@link ApplicationShell} focus
 * tracker picks up the new editor. Consumers must not assume that all embedded editors
 * are present synchronously when this widget is returned.
 */
@injectable()
export class MultiDiffEditor extends BaseWidget implements Navigatable, ApplicationShell.TrackableWidgetProvider, StatefulWidget {

    @inject(MultiDiffEditorData)
    protected readonly data: MultiDiffEditorUriData;

    protected readonly entryWidgets: DiffEntryWidget[] = [];
    protected entriesPanel: Panel;
    protected encodedUri: URI;
    protected entryObserver?: IntersectionObserver;
    protected lastFocusedEntry?: DiffEntryWidget;

    protected readonly onDidChangeTrackableWidgetsEmitter = new Emitter<Widget[]>();
    readonly onDidChangeTrackableWidgets: Event<Widget[]> = this.onDidChangeTrackableWidgetsEmitter.event;

    /** Scroll position from a previous session, applied once the widget is attached. */
    protected pendingScrollTop?: number;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.onDidChangeTrackableWidgetsEmitter);
        this.addClass('theia-multi-diff-editor');
        this.encodedUri = MultiDiffEditorUri.encode(this.data);
        this.id = MultiDiffEditorOpenHandler.ID + ':' + this.encodedUri.toString();
        this.title.label = this.data.title;
        this.title.caption = this.data.title;
        this.title.closable = true;
        this.title.iconClass = 'codicon codicon-diff-multiple file-icon';

        this.entriesPanel = new Panel();
        this.entriesPanel.addClass('multi-diff-editor-entries');
        const layout = new PanelLayout();
        layout.addWidget(this.entriesPanel);
        this.layout = layout;
        if (typeof IntersectionObserver !== 'undefined') {
            this.entryObserver = new IntersectionObserver(entries => {
                if (!this.isDisposed) {
                    for (const observed of entries) {
                        if (observed.isIntersecting) {
                            this.entryWidgets.find(entry => entry.node === observed.target)?.loadEditor();
                        }
                    }
                }
            }, { root: this.entriesPanel.node, rootMargin: '500px 0px' });
            this.toDispose.push({ dispose: () => this.entryObserver?.disconnect() });
        }
        this.addEventListener(this.entriesPanel.node, 'focusin', event => {
            this.lastFocusedEntry = this.entryWidgets.find(entry => event.target instanceof Node && entry.node.contains(event.target));
        });
    }

    get entries(): readonly DiffEntryWidget[] {
        return this.entryWidgets;
    }

    addDiffEntry(resource: MultiDiffEditorResourcePair, headerWidget: DiffEntryHeaderWidget, createEditor?: () => Promise<EditorWidget>): DiffEntryWidget {
        const entry = new DiffEntryWidget(resource, headerWidget, createEditor);
        this.entryWidgets.push(entry);
        this.entriesPanel.addWidget(entry);
        this.toDispose.push(entry.onDidLoadEditor(() => this.notifyTrackableWidgetsChanged()));
        this.entryObserver?.observe(entry.node);
        return entry;
    }

    /**
     * Notify listeners (in particular, the {@link ApplicationShell} focus tracker) that a
     * new editor widget has been attached to one of the entries. Called on the entry's
     * {@link DiffEntryWidget.onDidLoadEditor} event.
     */
    notifyTrackableWidgetsChanged(): void {
        this.onDidChangeTrackableWidgetsEmitter.fire(this.getTrackableWidgets());
    }

    revealResource(modifiedUri: URI): void {
        const uriStr = modifiedUri.toString();
        const entry = this.entryWidgets.find(e => e.modifiedUri.toString() === uriStr);
        if (!entry) {
            return;
        }
        entry.setCollapsed(false);
        entry.loadEditor();
        // Defer scrolling so embedded editors have a chance to complete their initial layout.
        requestAnimationFrame(() => {
            if (!this.isDisposed && entry.isAttached) {
                entry.node.scrollIntoView({ block: 'start' });
            }
        });
    }

    getTrackableWidgets(): Widget[] {
        const result: Widget[] = [];
        for (const entry of this.entryWidgets) {
            if (entry.editorWidget) {
                result.push(entry.editorWidget);
            }
        }
        return result;
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const viewport = this.entriesPanel.node.getBoundingClientRect();
        const isVisible = (candidate: DiffEntryWidget): boolean => {
            const bounds = candidate.node.getBoundingClientRect();
            return !candidate.isCollapsed && !!candidate.editorWidget && bounds.bottom > viewport.top && bounds.top < viewport.bottom;
        };
        const entry = this.lastFocusedEntry && isVisible(this.lastFocusedEntry)
            ? this.lastFocusedEntry : this.entryWidgets.find(isVisible);
        if (entry?.editorWidget) {
            const scrollPositions: { node: HTMLElement; top: number; left: number }[] = [];
            for (let node: HTMLElement | undefined = this.entriesPanel.node; node; node = node.parentElement ?? undefined) {
                scrollPositions.push({ node, top: node.scrollTop, left: node.scrollLeft });
            }
            // Deliver activation synchronously so focus-induced ancestor scrolling can be restored.
            MessageLoop.sendMessage(entry.editorWidget, Widget.Msg.ActivateRequest);
            for (const position of scrollPositions) {
                position.node.scrollTop = position.top;
                position.node.scrollLeft = position.left;
            }
        } else {
            this.node.tabIndex = -1;
            this.node.focus({ preventScroll: true });
        }
    }

    protected override onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        const height = msg.height < 0 ? this.node.clientHeight : msg.height;
        if (this.entryWidgets.length === 1 && height > 0) {
            this.entryWidgets[0].setAvailableHeight(height);
        }
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (!this.entryObserver) {
            for (const entry of this.entryWidgets) {
                entry.loadEditor();
            }
        }
        // Restore scroll after attach so layout has produced valid scroll extents.
        if (this.pendingScrollTop !== undefined) {
            const scrollTop = this.pendingScrollTop;
            this.pendingScrollTop = undefined;
            requestAnimationFrame(() => {
                if (!this.isDisposed && this.entriesPanel.isAttached) {
                    this.entriesPanel.node.scrollTop = scrollTop;
                }
            });
        }
    }

    storeState(): undefined {
        // Resource providers may not be registered yet when the layout is restored.
        return undefined;
    }

    restoreState(state: object): void {
        if (!MultiDiffEditorState.is(state)) {
            return;
        }
        if (state.collapsedUris) {
            const collapsed = new Set(state.collapsedUris);
            for (const entry of this.entryWidgets) {
                if (collapsed.has(entry.modifiedUri.toString())) {
                    entry.setCollapsed(true);
                }
            }
        }
        this.pendingScrollTop = state.scrollTop;
    }

    getResourceUri(): URI | undefined {
        return this.encodedUri;
    }

    createMoveToUri(_resourceUri: URI): URI | undefined {
        // Multi-diff editors represent a collection of resources, so they cannot be moved to a single resource.
        return undefined;
    }
}

@injectable()
export class MultiDiffEditorLabelProvider implements LabelProviderContribution {

    canHandle(element: object): number {
        return element instanceof URI && MultiDiffEditorUri.isMultiDiffEditorUri(element) ? 20 : 0;
    }

    getName(uri: URI): string {
        return MultiDiffEditorUri.decode(uri).title;
    }

    getLongName(uri: URI): string {
        return this.getName(uri);
    }

    getIcon(): string {
        return codicon('diff-multiple');
    }
}

@injectable()
export class MultiDiffEditorOpenHandler extends NavigatableWidgetOpenHandler<MultiDiffEditor> {

    static readonly ID = 'multi-diff-editor-opener';

    readonly id = MultiDiffEditorOpenHandler.ID;

    readonly label = nls.localizeByDefault('Multi Diff Editor');

    override canHandle(uri: URI, options?: MultiDiffEditorOpenerOptions): number {
        return MultiDiffEditorUri.isMultiDiffEditorUri(uri) ? 1000 : 0;
    }

    override async open(uri: URI, options?: MultiDiffEditorOpenerOptions): Promise<MultiDiffEditor> {
        const widget = await super.open(uri, options);
        if (options?.reveal) {
            widget.revealResource(options.reveal);
        }
        return widget;
    }
}
