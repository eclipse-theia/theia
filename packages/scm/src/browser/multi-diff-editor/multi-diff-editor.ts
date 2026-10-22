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
import { Disposable, DisposableCollection, Emitter, Event, nls, URI } from '@theia/core';
import * as monaco from '@theia/monaco-editor-core';
import {
    addEventListener, ApplicationShell, BaseWidget, BoxLayout, codicon, Key, LabelProvider, LabelProviderContribution,
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
 * Initial height of loading and error placeholders (in pixels).
 */
export const MIN_ENTRY_HEIGHT = 120;
/**
 * Fallback height limit before the viewport size is known (in pixels).
 */
export const MAX_ENTRY_HEIGHT = 500;
/**
 * Height of the header bar above each embedded diff editor (in pixels).
 * Used as the collapsed-entry height and as the sizeBasis of the BoxLayout header child.
 */
export const HEADER_HEIGHT = 28;

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
 * editor's content size up to 5000 pixels. A single entry fills the viewport.
 * Entries can be collapsed (showing only the header) via {@link DiffEntryWidget.setCollapsed}.
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
    protected fillViewport = false;
    protected requestedHeight = MIN_ENTRY_HEIGHT;
    protected contentHeight?: number;
    protected innerScrolling?: boolean;
    protected loading = false;
    protected loadAttempted = false;
    protected pendingLoad?: Promise<void>;

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

    /**
     * The diff editor of this entry, if it is loaded.
     */
    getDiffEditor(): MonacoDiffEditor | undefined {
        const editor = this._editorWidget && MonacoEditor.get(this._editorWidget);
        return editor instanceof MonacoDiffEditor ? editor : undefined;
    }

    /**
     * The changes of this entry, or `undefined` until the diff editor is loaded and has computed the diff.
     */
    get lineChanges(): readonly monaco.editor.ILineChange[] | undefined {
        return this.getDiffEditor()?.diffEditor.getLineChanges() ?? undefined;
    }

    /**
     * Load the diff editor if necessary and wait until it has computed the diff.
     * Resolves to `undefined` if the entry is collapsed, the editor cannot be loaded, or the entry is disposed.
     */
    async waitForLineChanges(): Promise<readonly monaco.editor.ILineChange[] | undefined> {
        await (this.loading ? this.pendingLoad : this.loadEditor());
        const diffEditor = this.getDiffEditor()?.diffEditor;
        if (this.isDisposed || !diffEditor) {
            return undefined;
        }
        return diffEditor.getLineChanges() ?? new Promise(resolve => {
            const toDispose = new DisposableCollection();
            const done = (changes?: readonly monaco.editor.ILineChange[]) => {
                toDispose.dispose();
                resolve(changes);
            };
            toDispose.push(diffEditor.onDidUpdateDiff(() => {
                const changes = diffEditor.getLineChanges();
                if (changes) {
                    done(changes);
                }
            }));
            toDispose.push(this.toDispose.push(Disposable.create(() => done())));
        });
    }

    /**
     * Move the focus to the header without scrolling.
     */
    focusHeader(): void {
        this.header.node.focus({ preventScroll: true });
    }

    /**
     * Collapse or expand the entry. Expanding also loads the editor, unless `load` is `false`.
     */
    setCollapsed(collapsed: boolean, load = true): void {
        if (this._isCollapsed === collapsed) {
            return;
        }
        this._isCollapsed = collapsed;
        this.header.setCollapsed(collapsed);
        this.currentContent.setHidden(collapsed);
        if (collapsed) {
            this.lastExpandedHeight = this.getCurrentHeight() || MIN_ENTRY_HEIGHT;
            this.setNodeHeight(this.getNonContentHeight());
        } else {
            this.setNodeHeight(this.lastExpandedHeight);
        }
        this.onDidChangeCollapsedEmitter.fire(collapsed);
        if (!collapsed && load) {
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
        this.pendingLoad = this.doLoadEditor(this.createEditor);
        await this.pendingLoad;
    }

    protected async doLoadEditor(createEditor: () => Promise<EditorWidget>): Promise<void> {
        try {
            const editorWidget = await createEditor();
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
     * Fit multiple entries to their content, capped at 5000 pixels; a single entry fills the viewport. While collapsed,
     * remember the requested height for expansion.
     */
    setHeight(height: number): void {
        this.requestedHeight = height;
        const limit = this.fillViewport ? (this.availableHeight ?? MAX_ENTRY_HEIGHT) : 5000;
        const clamped = Math.max(this.getNonContentHeight(), this.fillViewport ? limit : Math.min(limit, height));
        this.lastExpandedHeight = clamped;
        if (!this._isCollapsed) {
            this.setNodeHeight(clamped);
        }
        this.updateInnerScrolling();
    }

    /** Update the viewport height, used when a single entry fills it. */
    setAvailableHeight(height: number, fillViewport = true): void {
        this.availableHeight = Math.max(this.getNonContentHeight(), height);
        this.fillViewport = fillViewport;
        this.setHeight(this.requestedHeight);
    }

    protected getNonContentHeight(): number {
        const style = window.getComputedStyle(this.node);
        return HEADER_HEIGHT + (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    }

    protected updateInnerScrolling(): void {
        if (this.contentHeight === undefined || !this._editorWidget) {
            return;
        }
        const scrolling = this.contentHeight > this.lastExpandedHeight - this.getNonContentHeight();
        if (this.innerScrolling === scrolling) {
            return;
        }
        // Set this before updating Monaco options, which can emit content-size events synchronously.
        this.innerScrolling = scrolling;
        const editor = MonacoEditor.get(this._editorWidget);
        const options = {
            scrollbar: { vertical: scrolling ? 'auto' as const : 'hidden' as const, handleMouseWheel: scrolling, alwaysConsumeMouseWheel: false }
        };
        if (editor instanceof MonacoDiffEditor) {
            editor.diffEditor.updateOptions(options);
        } else {
            editor?.getControl().updateOptions(options);
        }
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (this.contentHeight !== undefined) {
            this.setHeight(this.contentHeight + this.getNonContentHeight());
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
        const control = monacoEditor instanceof MonacoDiffEditor ? monacoEditor.diffEditor.getModifiedEditor() : monacoEditor.getControl();
        this.toDispose.push(addEventListener(editorWidget.node, 'wheel', event => {
            if (!this.innerScrolling || event.ctrlKey || event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
                return;
            }
            const scrollTop = control.getScrollTop();
            const atBoundary = event.deltaY < 0
                ? scrollTop <= 0
                : scrollTop >= control.getScrollHeight() - control.getLayoutInfo().height;
            if (atBoundary) {
                // Monaco does not apply alwaysConsumeMouseWheel changes to an existing scrollbar.
                event.stopPropagation();
            }
        }, true));
        const getContentHeight = (): number => {
            if (monacoEditor instanceof MonacoDiffEditor) {
                return Math.max(
                    monacoEditor.diffEditor.getOriginalEditor().getContentHeight(),
                    monacoEditor.diffEditor.getModifiedEditor().getContentHeight()
                );
            }
            return monacoEditor.getControl().getContentHeight();
        };
        const updateHeight = () => {
            this.contentHeight = getContentHeight();
            this.setHeight(this.contentHeight + this.getNonContentHeight());
        };
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
    /** Whether the last focus in {@link lastFocusedEntry} was inside its editor, and not on its header. */
    protected focusInEditor = false;

    protected readonly onDidChangeTrackableWidgetsEmitter = new Emitter<Widget[]>();
    readonly onDidChangeTrackableWidgets: Event<Widget[]> = this.onDidChangeTrackableWidgetsEmitter.event;

    protected readonly onDidChangeNavigationStateEmitter = new Emitter<void>();
    /**
     * Fires when the navigation and collapse state can change: the focused entry or its cursor moves,
     * an entry is collapsed or expanded, or an entry computes its diff.
     */
    readonly onDidChangeNavigationState: Event<void> = this.onDidChangeNavigationStateEmitter.event;

    protected pendingReveal?: DiffEntryWidget;

    @postConstruct()
    protected init(): void {
        this.toDispose.pushAll([this.onDidChangeTrackableWidgetsEmitter, this.onDidChangeNavigationStateEmitter]);
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
            const target = event.target instanceof Node ? event.target : undefined;
            const entry = target && this.entryWidgets.find(candidate => candidate.node.contains(target));
            this.setFocusedEntry(entry, !!target && !!entry?.editorWidget?.node.contains(target));
        });
    }

    get entries(): readonly DiffEntryWidget[] {
        return this.entryWidgets;
    }

    addDiffEntry(resource: MultiDiffEditorResourcePair, headerWidget: DiffEntryHeaderWidget, createEditor?: () => Promise<EditorWidget>): DiffEntryWidget {
        const entry = new DiffEntryWidget(resource, headerWidget, createEditor);
        this.entryWidgets.push(entry);
        this.entriesPanel.addWidget(entry);
        this.toDispose.pushAll([
            entry.onDidLoadEditor(() => {
                this.notifyTrackableWidgetsChanged();
                this.trackNavigationState(entry);
                if (this.pendingReveal === entry) {
                    this.scrollToEntry(entry);
                }
            }),
            entry.onDidChangeCollapsed(() => this.onDidChangeNavigationStateEmitter.fire())
        ]);
        this.entryObserver?.observe(entry.node);
        this.onDidChangeNavigationStateEmitter.fire();
        return entry;
    }

    /**
     * Fire {@link onDidChangeNavigationState} when the diff of a loaded entry or the cursor of the focused entry changes.
     */
    protected trackNavigationState(entry: DiffEntryWidget): void {
        const diffEditor = entry.getDiffEditor()?.diffEditor;
        if (diffEditor) {
            this.toDispose.pushAll([
                diffEditor.onDidUpdateDiff(() => this.onDidChangeNavigationStateEmitter.fire()),
                diffEditor.getModifiedEditor().onDidChangeCursorPosition(() => {
                    if (entry === this.lastFocusedEntry) {
                        this.onDidChangeNavigationStateEmitter.fire();
                    }
                })
            ]);
        }
        this.onDidChangeNavigationStateEmitter.fire();
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
        this.revealEntry(entry);
    }

    hasPreviousEntry(): boolean {
        return this.getFocusedIndex() > 0;
    }

    hasNextEntry(): boolean {
        return this.getFocusedIndex() < this.entryWidgets.length - 1;
    }

    goToPreviousEntry(): void {
        const index = this.getFocusedIndex();
        if (index > 0) {
            this.goToEntry(this.entryWidgets[index - 1]);
        }
    }

    goToNextEntry(): void {
        const entry = this.entryWidgets[this.getFocusedIndex() + 1];
        if (entry) {
            this.goToEntry(entry);
        }
    }

    /**
     * Check for a change before the cursor. Entries that are not loaded yet count as entries with changes.
     */
    hasPreviousChange(): boolean {
        const index = this.getFocusedIndex();
        if (index < 0) {
            return false;
        }
        const line = this.getCursorLine();
        const current = this.entryWidgets[index];
        return !!this.getKnownChangeLines(current)?.some(candidate => candidate < line)
            || this.entryWidgets.slice(0, index).some(entry => this.getKnownChangeLines(entry)?.length !== 0);
    }

    /**
     * Check for a change after the cursor. Entries that are not loaded yet count as entries with changes.
     */
    hasNextChange(): boolean {
        const index = this.getFocusedIndex();
        const current = this.entryWidgets[index];
        if (current) {
            const lines = this.getKnownChangeLines(current);
            const line = this.getCursorLine();
            if (!lines || lines.some(candidate => candidate > line)) {
                return true;
            }
        }
        return this.entryWidgets.slice(index + 1).some(entry => this.getKnownChangeLines(entry)?.length !== 0);
    }

    /**
     * Go to the previous change, in the focused entry or in a previous entry. Entries are expanded and loaded as necessary.
     */
    async goToPreviousChange(): Promise<void> {
        const current = this.lastFocusedEntry;
        if (!current) {
            return;
        }
        const before = this.getCursorLine();
        for (let index = this.entryWidgets.indexOf(current); index >= 0; index--) {
            const entry = this.entryWidgets[index];
            if (entry === current && before === 0) {
                continue;
            }
            const lines = await this.getChangeLines(entry);
            if (!lines) {
                return;
            }
            const line = lines.filter(candidate => entry !== current || candidate < before).pop();
            if (line !== undefined) {
                this.revealLine(entry, line);
                return;
            }
        }
    }

    /**
     * Go to the next change, in the focused entry or in a following entry. Entries are expanded and loaded as necessary.
     */
    async goToNextChange(): Promise<void> {
        const current = this.lastFocusedEntry;
        const after = this.getCursorLine();
        for (let index = Math.max(this.getFocusedIndex(), 0); index < this.entryWidgets.length; index++) {
            const entry = this.entryWidgets[index];
            const lines = await this.getChangeLines(entry);
            if (!lines) {
                return;
            }
            const line = lines.find(candidate => entry !== current || candidate > after);
            if (line !== undefined) {
                this.revealLine(entry, line);
                return;
            }
        }
    }

    areAllEntriesCollapsed(): boolean {
        return this.entryWidgets.every(entry => entry.isCollapsed);
    }

    collapseAll(): void {
        for (const entry of this.entryWidgets) {
            entry.setCollapsed(true);
        }
    }

    /**
     * Expand all entries. Only the entries near the viewport load their editors; the others load when they are scrolled into view.
     */
    expandAll(): void {
        for (const entry of this.entryWidgets) {
            entry.setCollapsed(false, false);
        }
        for (const entry of this.entryWidgets) {
            if (this.entryObserver) {
                // A new observation reports the current intersection, also for entries that were near the viewport while collapsed.
                this.entryObserver.unobserve(entry.node);
                this.entryObserver.observe(entry.node);
            } else {
                entry.loadEditor();
            }
        }
    }

    protected getFocusedIndex(): number {
        return this.lastFocusedEntry ? this.entryWidgets.indexOf(this.lastFocusedEntry) : -1;
    }

    protected setFocusedEntry(entry: DiffEntryWidget | undefined, focusInEditor: boolean): void {
        if (entry !== this.lastFocusedEntry || focusInEditor !== this.focusInEditor) {
            this.lastFocusedEntry = entry;
            this.focusInEditor = focusInEditor;
            this.onDidChangeNavigationStateEmitter.fire();
        }
    }

    /**
     * The cursor line in the focused entry, or 0 if the focus is on its header or the entry is collapsed.
     */
    protected getCursorLine(): number {
        const entry = this.lastFocusedEntry;
        if (!entry || !this.focusInEditor || entry.isCollapsed) {
            return 0;
        }
        return entry.getDiffEditor()?.diffEditor.getModifiedEditor().getPosition()?.lineNumber ?? 0;
    }

    /**
     * The first modified line of each change, as used by Monaco's diff navigation, or `undefined` while the diff is not known.
     */
    protected getKnownChangeLines(entry: DiffEntryWidget): number[] | undefined {
        const changes = entry.lineChanges;
        if (!changes) {
            return undefined;
        }
        const lineCount = entry.getDiffEditor()?.diffEditor.getModifiedEditor().getModel()?.getLineCount() ?? 1;
        // A deletion has no modified lines, so it starts at the line after the deleted range.
        return changes.map(change => Math.min(change.modifiedEndLineNumber === 0 ? change.modifiedStartLineNumber + 1 : change.modifiedStartLineNumber, lineCount));
    }

    /**
     * Get the change lines of the entry. If the diff is not known yet, go to the entry and wait while it loads.
     * Resolves to `undefined` if the focus moved to another entry in the meantime.
     */
    protected async getChangeLines(entry: DiffEntryWidget): Promise<number[] | undefined> {
        const lines = this.getKnownChangeLines(entry);
        if (lines) {
            return lines;
        }
        this.goToEntry(entry);
        await entry.waitForLineChanges();
        if (this.isDisposed || this.lastFocusedEntry !== entry) {
            return undefined;
        }
        return this.getKnownChangeLines(entry) ?? [];
    }

    /**
     * Reveal the entry and move the focus to its header.
     */
    protected goToEntry(entry: DiffEntryWidget): void {
        this.setFocusedEntry(entry, false);
        this.revealEntry(entry);
        entry.focusHeader();
    }

    /**
     * Move the cursor of the entry to the line, focus the editor, and scroll the line to the middle of the entries panel.
     */
    protected revealLine(entry: DiffEntryWidget, lineNumber: number): void {
        const editorWidget = entry.editorWidget;
        const modifiedEditor = entry.getDiffEditor()?.diffEditor.getModifiedEditor();
        if (!editorWidget || !modifiedEditor) {
            return;
        }
        this.pendingReveal = undefined;
        entry.setCollapsed(false);
        modifiedEditor.setPosition({ lineNumber, column: 1 });
        this.setFocusedEntry(entry, true);
        this.focusEditor(editorWidget);
        requestAnimationFrame(() => {
            if (!this.isDisposed && entry.isAttached && this.lastFocusedEntry === entry) {
                // Long diffs scroll inside the editor, so reveal the line there first.
                modifiedEditor.revealLineInCenterIfOutsideViewport(lineNumber, monaco.editor.ScrollType.Immediate);
                const panel = this.entriesPanel.node;
                const editorTop = editorWidget.node.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
                const lineTop = modifiedEditor.getTopForLineNumber(lineNumber) - modifiedEditor.getScrollTop();
                panel.scrollTop = Math.max(0, editorTop + lineTop - panel.clientHeight / 2);
            }
        });
    }

    /**
     * Expand and load the entry, and scroll it to the top of the entries panel.
     */
    protected revealEntry(entry: DiffEntryWidget): void {
        this.pendingReveal = entry;
        entry.setCollapsed(false);
        entry.loadEditor();
        this.scrollToEntry(entry);
    }

    protected scrollToEntry(entry: DiffEntryWidget): void {
        // Scroll only the entries panel, and repeat after the target editor's initial layout.
        requestAnimationFrame(() => {
            if (!this.isDisposed && entry.isAttached && this.pendingReveal === entry) {
                this.entriesPanel.node.scrollTop = entry.node.offsetTop;
                if (entry.editorWidget) {
                    this.pendingReveal = undefined;
                }
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
            this.focusEditor(entry.editorWidget);
        } else {
            this.node.tabIndex = -1;
            this.node.focus({ preventScroll: true });
        }
    }

    /**
     * Activate the editor without changing the scroll position of the entries panel and its ancestors.
     */
    protected focusEditor(editorWidget: EditorWidget): void {
        const scrollPositions: { node: HTMLElement; top: number; left: number }[] = [];
        for (let node: HTMLElement | undefined = this.entriesPanel.node; node; node = node.parentElement ?? undefined) {
            scrollPositions.push({ node, top: node.scrollTop, left: node.scrollLeft });
        }
        // Deliver activation synchronously so focus-induced ancestor scrolling can be restored.
        MessageLoop.sendMessage(editorWidget, Widget.Msg.ActivateRequest);
        for (const position of scrollPositions) {
            position.node.scrollTop = position.top;
            position.node.scrollLeft = position.left;
        }
    }

    protected override onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        const height = msg.height < 0 ? this.node.clientHeight : msg.height;
        if (height > 0) {
            for (const entry of this.entryWidgets) {
                entry.setAvailableHeight(height, this.entryWidgets.length === 1);
            }
        }
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (!this.entryObserver) {
            for (const entry of this.entryWidgets) {
                entry.loadEditor();
            }
        }
    }

    storeState(): undefined {
        // Resource providers may not be registered yet when the layout is restored.
        return undefined;
    }

    restoreState(_state: object): void { }

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
