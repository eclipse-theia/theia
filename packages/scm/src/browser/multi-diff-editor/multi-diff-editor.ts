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
    ApplicationShell, BaseWidget, BoxLayout, codicon, Key, LabelProvider,
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
 * Persisted state of a {@link MultiDiffEditor} — scroll position and per-entry
 * collapsed state, keyed by the modified URI (stable across reloads).
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

    constructor(message: string) {
        super();
        this.addClass('multi-diff-entry-error');
        const icon = document.createElement('span');
        icon.className = codicon('error');
        this.node.appendChild(icon);
        const text = document.createElement('span');
        text.textContent = message;
        this.node.appendChild(text);
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

    protected readonly onDidChangeCollapsedEmitter = new Emitter<boolean>();
    readonly onDidChangeCollapsed: Event<boolean> = this.onDidChangeCollapsedEmitter.event;

    constructor(
        resource: MultiDiffEditorResourcePair,
        headerWidget: DiffEntryHeaderWidget
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
        if (collapsed) {
            this.lastExpandedHeight = this.getCurrentHeight() || MIN_ENTRY_HEIGHT;
            this.setNodeHeight(HEADER_HEIGHT);
        } else {
            this.setNodeHeight(this.lastExpandedHeight);
        }
        this.onDidChangeCollapsedEmitter.fire(collapsed);
    }

    setError(message: string): void {
        this.replaceContent(new DiffEntryErrorWidget(message));
    }

    setEditor(editorWidget: EditorWidget): void {
        // When the editor widget becomes visible, Monaco's handleVisibilityChanged calls
        // focus() on the underlying editor, which causes the browser to scroll the entry
        // into view. As entries load one-by-one (often out of order), each focus() jumps
        // the viewport to the newly-loaded entry. Capture and restore the scroll offset
        // to keep the user's viewport stable.
        const scrollContainer = this.findScrollContainer();
        const previousScrollTop = scrollContainer?.scrollTop;

        this._editorWidget = editorWidget;
        this.replaceContent(editorWidget);
        this.trackContentHeight(editorWidget);

        if (scrollContainer && previousScrollTop !== undefined && scrollContainer.scrollTop !== previousScrollTop) {
            scrollContainer.scrollTop = previousScrollTop;
        }
    }

    protected findScrollContainer(): HTMLElement | undefined {
        let current: HTMLElement | null = this.node.parentElement;
        while (current) {
            const overflowY = getComputedStyle(current).overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll') {
                return current;
            }
            current = current.parentElement;
        }
        return undefined;
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
        const clamped = Math.max(MIN_ENTRY_HEIGHT, Math.min(MAX_ENTRY_HEIGHT, height));
        this.lastExpandedHeight = clamped;
        if (!this._isCollapsed) {
            this.setNodeHeight(clamped);
        }
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
    }

    get entries(): readonly DiffEntryWidget[] {
        return this.entryWidgets;
    }

    addDiffEntry(resource: MultiDiffEditorResourcePair, headerWidget: DiffEntryHeaderWidget): DiffEntryWidget {
        const entry = new DiffEntryWidget(resource, headerWidget);
        this.entryWidgets.push(entry);
        this.entriesPanel.addWidget(entry);
        return entry;
    }

    /**
     * Notify listeners (in particular, the {@link ApplicationShell} focus tracker) that a
     * new editor widget has been attached to one of the entries. Called by the factory
     * after {@link DiffEntryWidget.setEditor} resolves.
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
        const loadedEntry = this.entryWidgets.find(e => e.editorWidget);
        if (loadedEntry?.editorWidget) {
            loadedEntry.editorWidget.activate();
        } else {
            this.node.tabIndex = -1;
            this.node.focus();
        }
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
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

    storeState(): MultiDiffEditorState {
        return {
            scrollTop: this.entriesPanel?.node.scrollTop,
            collapsedUris: this.entryWidgets.filter(e => e.isCollapsed).map(e => e.modifiedUri.toString())
        };
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
