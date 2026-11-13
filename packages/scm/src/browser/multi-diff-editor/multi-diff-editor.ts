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
import { DisposableCollection, Emitter, Event, nls, URI } from '@theia/core';
import {
    addEventListener, ApplicationShell, BaseWidget, BoxLayout, codicon, Key, LabelProvider, LabelProviderContribution,
    Message, MessageLoop, Navigatable, NavigatableWidgetOpenHandler, Panel, PanelLayout, Saveable, StatefulWidget,
    Widget, WidgetOpenerOptions
} from '@theia/core/lib/browser';
import { EditorWidget } from '@theia/editor/lib/browser';
import * as monaco from '@theia/monaco-editor-core';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoDiffEditor } from '@theia/monaco/lib/browser/monaco-diff-editor';
import { MultiDiffEditorUri, MultiDiffEditorResourcePair, MultiDiffEditorUriData } from './multi-diff-editor-uri.js';

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
 * {@link DiffEntryWidget.setHeight} and reflects the editor's full content size to
 * enable continuous scrolling in the outer container, while the rendered editor size
 * is bounded to the available viewport space.
 * Entries can be collapsed (showing only the header) via {@link DiffEntryWidget.setCollapsed}.
 */
export class DiffEntryWidget extends BaseWidget {

    readonly modifiedUri: URI;

    protected readonly boxLayout: BoxLayout;
    protected readonly header: DiffEntryHeaderWidget;
    protected readonly filler: BaseWidget;
    protected currentContent: Widget;
    protected _editorWidget?: EditorWidget;

    protected _isCollapsed = false;
    protected _isIntersecting = true;
    protected observed = false;
    /** Height to restore when expanding from a collapsed state. */
    protected lastExpandedHeight = MIN_ENTRY_HEIGHT;
    protected availableHeight?: number;
    protected fillViewport = false;
    protected requestedHeight = MIN_ENTRY_HEIGHT;
    protected contentHeight?: number;
    protected renderedEditorHeight?: number;
    protected isSettingScrollTop = false;
    protected lastScrollTop = 0;
    protected savedViewState?: monaco.editor.IEditorViewState;
    protected innerScrolling?: boolean;
    protected loading = false;
    protected loadAttempted = false;

    protected readonly editorToDispose = new DisposableCollection();

    protected readonly onDidLoadEditorEmitter = new Emitter<void>();
    readonly onDidLoadEditor: Event<void> = this.onDidLoadEditorEmitter.event;

    protected readonly onDidUnloadEditorEmitter = new Emitter<void>();
    readonly onDidUnloadEditor: Event<void> = this.onDidUnloadEditorEmitter.event;

    protected readonly onDidChangeCollapsedEmitter = new Emitter<boolean>();
    readonly onDidChangeCollapsed: Event<boolean> = this.onDidChangeCollapsedEmitter.event;

    protected readonly onDidChangeHeightEmitter = new Emitter<void>();
    readonly onDidChangeHeight: Event<void> = this.onDidChangeHeightEmitter.event;

    protected readonly onDidRequestScrollOuterEmitter = new Emitter<number>();
    readonly onDidRequestScrollOuter: Event<number> = this.onDidRequestScrollOuterEmitter.event;

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
        BoxLayout.setStretch(this.currentContent, 0);
        BoxLayout.setSizeBasis(this.currentContent, MIN_ENTRY_HEIGHT);
        this.boxLayout.addWidget(this.currentContent);

        this.filler = new BaseWidget();
        this.filler.addClass('multi-diff-entry-filler');
        BoxLayout.setStretch(this.filler, 1);
        BoxLayout.setSizeBasis(this.filler, 0);
        this.boxLayout.addWidget(this.filler);

        this.layout = this.boxLayout;
        Object.defineProperty(this.node, 'offsetHeight', {
            get: () => parseFloat(this.node.style.height) || 0,
            configurable: true
        });
        Object.defineProperty(this.node, 'offsetWidth', {
            get: () => parseFloat(this.node.style.width) || this.node.clientWidth || 1000,
            configurable: true
        });
        this.setHeight(MIN_ENTRY_HEIGHT);

        this.toDispose.pushAll([
            this.onDidChangeCollapsedEmitter,
            this.onDidChangeHeightEmitter,
            this.onDidLoadEditorEmitter,
            this.onDidUnloadEditorEmitter,
            this.onDidRequestScrollOuterEmitter,
            this.header.onDidToggleCollapse(() => this.setCollapsed(!this._isCollapsed))
        ]);
    }

    get editorWidget(): EditorWidget | undefined {
        return this._editorWidget;
    }

    get isCollapsed(): boolean {
        return this._isCollapsed;
    }

    get editorHeight(): number | undefined {
        return this.renderedEditorHeight;
    }

    get isIntersecting(): boolean {
        return this._isIntersecting;
    }

    setIntersecting(intersecting: boolean): void {
        this.observed = true;
        this._isIntersecting = intersecting;
    }

    setCollapsed(collapsed: boolean): void {
        if (this._isCollapsed === collapsed) {
            return;
        }
        this._isCollapsed = collapsed;
        this.header.setCollapsed(collapsed);
        this.currentContent.setHidden(collapsed);
        this.filler.setHidden(collapsed);
        if (collapsed) {
            this.lastExpandedHeight = this.getCurrentHeight() || MIN_ENTRY_HEIGHT;
            this.header.node.style.top = '0px';
            this.currentContent.node.style.top = `${HEADER_HEIGHT}px`;
            this.header.node.style.transform = '';
            this.currentContent.node.style.transform = '';
            this.setNodeHeight(this.getNonContentHeight());
        } else {
            this.setNodeHeight(this.lastExpandedHeight);
            if (this._isIntersecting || !this.observed) {
                this.loadEditor();
            }
        }
        this.onDidChangeCollapsedEmitter.fire(collapsed);
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
            if (this.isDisposed || (this.observed && !this._isIntersecting)) {
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

    unloadEditor(): void {
        if (!this._editorWidget) {
            return;
        }
        if (typeof document !== 'undefined' && this.node.contains(document.activeElement)) {
            return;
        }
        if (Saveable.isDirty(this._editorWidget)) {
            return;
        }
        const monacoEditor = MonacoEditor.get(this._editorWidget);
        if (monacoEditor?.document?.dirty) {
            return;
        }
        if (monacoEditor) {
            try {
                this.savedViewState = monacoEditor.storeViewState() as monaco.editor.IEditorViewState;
            } catch {
                // In mocked test environments or uninitialized models, storeViewState may not be available.
            }
        }
        this.editorToDispose.dispose();
        this.innerScrolling = undefined;
        this.lastScrollTop = 0;
        this.loadAttempted = false;
        const editor = this._editorWidget;
        this._editorWidget = undefined;
        this.replaceContent(new DiffEntryLoadingWidget());
        editor.dispose();
        this.onDidUnloadEditorEmitter.fire();
    }

    setError(message: string): void {
        this.replaceContent(new DiffEntryErrorWidget(message, () => this.loadEditor(true)));
    }

    setEditor(editorWidget: EditorWidget): void {
        this._editorWidget = editorWidget;
        this.replaceContent(editorWidget);
        const monacoEditor = MonacoEditor.get(editorWidget);
        if (monacoEditor && this.savedViewState) {
            monacoEditor.restoreViewState(this.savedViewState);
            this.savedViewState = undefined;
        }
        this.updateInnerScrolling();
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
        BoxLayout.setStretch(widget, 0);
        if (this.renderedEditorHeight !== undefined) {
            BoxLayout.setSizeBasis(widget, this.renderedEditorHeight);
        }
        this.boxLayout.insertWidget(1, widget);
        this.currentContent = widget;
        // eslint-disable-next-line no-null/no-null
        old.parent = null;
        old.dispose();
        if (this.isAttached) {
            MessageLoop.sendMessage(this, Widget.Msg.FitRequest);
        }
    }

    /**
     * Fit multiple entries to their content to allow continuous outer scrolling,
     * while bounding the embedded editor height to the available viewport space.
     */
    setHeight(height: number): void {
        this.requestedHeight = height;
        const nonContentHeight = this.getNonContentHeight();
        const availableContent = this.availableHeight
            ? Math.max(MIN_ENTRY_HEIGHT, this.availableHeight - nonContentHeight)
            : MAX_ENTRY_HEIGHT;
        const totalHeight = Math.max(nonContentHeight, this.fillViewport ? (this.availableHeight ?? MAX_ENTRY_HEIGHT) : height);
        this.lastExpandedHeight = totalHeight;
        this.renderedEditorHeight = this.fillViewport
            ? availableContent
            : Math.min(Math.max(0, height - nonContentHeight), availableContent);
        if (this.currentContent) {
            BoxLayout.setSizeBasis(this.currentContent, this.renderedEditorHeight);
        }
        if (!this._isCollapsed) {
            this.setNodeHeight(totalHeight);
        }
        this.updateInnerScrolling();
        this.onDidChangeHeightEmitter.fire();
    }

    /** Update the viewport height, used when a single entry fills it. */
    setAvailableHeight(height: number, fillViewport = true): void {
        this.availableHeight = Math.max(this.getNonContentHeight(), height);
        this.fillViewport = fillViewport;
        this.setHeight(this.requestedHeight);
    }

    updateScroll(panelScrollTop: number, entryOffsetTop = this.node.offsetTop): void {
        if (this._isCollapsed || !this.contentHeight || !this.renderedEditorHeight) {
            return;
        }
        if (this.fillViewport) {
            if (this.header.node.style.top !== '0px') {
                this.header.node.style.top = '0px';
            }
            const defaultContentTop = `${HEADER_HEIGHT}px`;
            if (this.currentContent.node.style.top !== defaultContentTop) {
                this.currentContent.node.style.top = defaultContentTop;
            }
            if (this.header.node.style.transform !== '') {
                this.header.node.style.transform = '';
            }
            if (this.currentContent.node.style.transform !== '') {
                this.currentContent.node.style.transform = '';
            }
            return;
        }
        const maxScroll = Math.max(0, this.contentHeight - this.renderedEditorHeight);
        if (maxScroll <= 0) {
            if (this.header.node.style.top !== '0px') {
                this.header.node.style.top = '0px';
            }
            const defaultContentTop = `${HEADER_HEIGHT}px`;
            if (this.currentContent.node.style.top !== defaultContentTop) {
                this.currentContent.node.style.top = defaultContentTop;
            }
            if (this.header.node.style.transform !== '') {
                this.header.node.style.transform = '';
            }
            if (this.currentContent.node.style.transform !== '') {
                this.currentContent.node.style.transform = '';
            }
            return;
        }
        const offset = panelScrollTop - entryOffsetTop;
        const scroll = Math.max(0, Math.min(offset, maxScroll));
        const headerTop = `${scroll}px`;
        if (this.header.node.style.top !== headerTop) {
            this.header.node.style.top = headerTop;
        }
        const contentTop = `${HEADER_HEIGHT + scroll}px`;
        if (this.currentContent.node.style.top !== contentTop) {
            this.currentContent.node.style.top = contentTop;
        }
        if (this.header.node.style.transform !== '') {
            this.header.node.style.transform = '';
        }
        if (this.currentContent.node.style.transform !== '') {
            this.currentContent.node.style.transform = '';
        }
        if (this._editorWidget) {
            const monacoEditor = MonacoEditor.get(this._editorWidget);
            const control = monacoEditor instanceof MonacoDiffEditor ? monacoEditor.diffEditor.getModifiedEditor() : monacoEditor?.getControl();
            if (control && control.getScrollTop() !== scroll) {
                try {
                    this.isSettingScrollTop = true;
                    control.setScrollTop(scroll);
                    this.lastScrollTop = control.getScrollTop();
                } finally {
                    this.isSettingScrollTop = false;
                }
            }
            if (monacoEditor instanceof MonacoDiffEditor) {
                const orig = monacoEditor.diffEditor.getOriginalEditor();
                if (orig && orig.getScrollTop() !== scroll) {
                    try {
                        this.isSettingScrollTop = true;
                        orig.setScrollTop(scroll);
                    } finally {
                        this.isSettingScrollTop = false;
                    }
                }
            }
        }
    }

    protected getNonContentHeight(): number {
        const style = window.getComputedStyle(this.node);
        return HEADER_HEIGHT + (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    }

    protected updateInnerScrolling(): void {
        if (this.contentHeight === undefined || !this._editorWidget) {
            return;
        }
        const scrolling = this.fillViewport && this.contentHeight > (this.renderedEditorHeight ?? 0);
        if (this.innerScrolling === scrolling) {
            return;
        }
        this.innerScrolling = scrolling;
        const editor = MonacoEditor.get(this._editorWidget);
        const options = {
            scrollbar: {
                vertical: scrolling ? 'auto' as const : 'hidden' as const,
                handleMouseWheel: scrolling,
                alwaysConsumeMouseWheel: false
            }
        };
        if (editor instanceof MonacoDiffEditor) {
            editor.diffEditor.updateOptions(options);
        } else {
            editor?.getControl().updateOptions(options);
        }
    }

    override processMessage(msg: Message): void {
        if (msg.type === 'resize') {
            MessageLoop.sendMessage(this, Widget.Msg.FitRequest);
        }
        super.processMessage(msg);
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
            MessageLoop.sendMessage(this, Widget.Msg.FitRequest);
            MessageLoop.sendMessage(this, new Widget.ResizeMessage(this.node.clientWidth || 1000, height));
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
        const control = monacoEditor instanceof MonacoDiffEditor
            ? monacoEditor.diffEditor.getModifiedEditor()
            : monacoEditor.getControl();

        this.editorToDispose.push(addEventListener(editorWidget.node, 'wheel', event => {
            if (!this.innerScrolling || event.ctrlKey || event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
                return;
            }
            const scrollTop = control.getScrollTop();
            const atBoundary = event.deltaY < 0
                ? scrollTop <= 0
                : scrollTop >= control.getScrollHeight() - control.getLayoutInfo().height;
            if (atBoundary) {
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

        const onScrollChange = (e: { scrollTop: number; scrollTopChanged?: boolean }) => {
            if (this.fillViewport || this.isSettingScrollTop || !e.scrollTopChanged) {
                return;
            }
            const delta = e.scrollTop - this.lastScrollTop;
            this.lastScrollTop = e.scrollTop;
            if (delta !== 0) {
                this.onDidRequestScrollOuterEmitter.fire(delta);
            }
        };

        const handleCursorChange = (editor: monaco.editor.ICodeEditor, e: monaco.editor.ICursorPositionChangedEvent) => {
            if (this.fillViewport || this.isSettingScrollTop || !editor.hasTextFocus?.()) {
                return;
            }
            if (typeof editor.getTopForLineNumber !== 'function') {
                return;
            }
            const lineTop = editor.getTopForLineNumber(e.position.lineNumber);
            const lineHeight = typeof editor.getOption === 'function'
                ? editor.getOption(monaco.editor.EditorOption.lineHeight)
                : 19;
            const cursorContentTop = HEADER_HEIGHT + lineTop;
            const cursorContentBottom = cursorContentTop + lineHeight;
            const cursorPanelTop = this.node.offsetTop + cursorContentTop;
            const cursorPanelBottom = this.node.offsetTop + cursorContentBottom;

            const parentNode = this.node.parentElement;
            if (!parentNode) {
                return;
            }
            const panelScrollTop = parentNode.scrollTop;
            const viewportHeight = parentNode.clientHeight;

            if (cursorPanelBottom > panelScrollTop + viewportHeight) {
                const delta = cursorPanelBottom - (panelScrollTop + viewportHeight);
                this.onDidRequestScrollOuterEmitter.fire(delta);
            } else if (cursorPanelTop < panelScrollTop + HEADER_HEIGHT) {
                const delta = cursorPanelTop - (panelScrollTop + HEADER_HEIGHT);
                this.onDidRequestScrollOuterEmitter.fire(delta);
            }
        };

        if (monacoEditor instanceof MonacoDiffEditor) {
            const orig = monacoEditor.diffEditor.getOriginalEditor();
            const mod = monacoEditor.diffEditor.getModifiedEditor();
            this.editorToDispose.push(orig.onDidContentSizeChange(updateHeight));
            this.editorToDispose.push(mod.onDidContentSizeChange(updateHeight));
            if (typeof mod.onDidScrollChange === 'function') {
                this.editorToDispose.push(mod.onDidScrollChange(onScrollChange));
            }
            if (typeof mod.onDidChangeCursorPosition === 'function') {
                this.editorToDispose.push(mod.onDidChangeCursorPosition(e => handleCursorChange(mod, e)));
            }
            if (typeof orig.onDidChangeCursorPosition === 'function') {
                this.editorToDispose.push(orig.onDidChangeCursorPosition(e => handleCursorChange(orig, e)));
            }
        } else {
            const codeControl = monacoEditor.getControl();
            this.editorToDispose.push(codeControl.onDidContentSizeChange(updateHeight));
            if (typeof codeControl.onDidScrollChange === 'function') {
                this.editorToDispose.push(codeControl.onDidScrollChange(onScrollChange));
            }
            if (typeof codeControl.onDidChangeCursorPosition === 'function') {
                this.editorToDispose.push(codeControl.onDidChangeCursorPosition(e => handleCursorChange(codeControl, e)));
            }
        }
        updateHeight();
    }

    override dispose(): void {
        this.editorToDispose.dispose();
        super.dispose();
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

    protected pendingReveal?: DiffEntryWidget;

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
                        const entry = this.entryWidgets.find(e => e.node === observed.target);
                        if (entry) {
                            entry.setIntersecting(observed.isIntersecting);
                            if (observed.isIntersecting) {
                                entry.loadEditor();
                            } else {
                                entry.unloadEditor();
                            }
                        }
                    }
                }
            }, { root: this.entriesPanel.node, rootMargin: '500px 0px' });
            this.toDispose.push({ dispose: () => this.entryObserver?.disconnect() });
        }
        this.addEventListener(this.entriesPanel.node, 'scroll', () => this.updateEntriesScroll());
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
        this.toDispose.push(entry.onDidLoadEditor(() => {
            this.notifyTrackableWidgetsChanged();
            entry.updateScroll(this.entriesPanel.node.scrollTop);
            if (this.pendingReveal === entry) {
                this.scrollToEntry(entry);
            }
        }));
        this.toDispose.push(entry.onDidUnloadEditor(() => {
            this.notifyTrackableWidgetsChanged();
        }));
        this.toDispose.push(entry.onDidChangeCollapsed(() => {
            this.updateEntriesScroll();
        }));
        this.toDispose.push(entry.onDidChangeHeight(() => {
            this.updateEntriesScroll();
        }));
        this.toDispose.push(entry.onDidRequestScrollOuter(delta => {
            this.entriesPanel.node.scrollTop += delta;
        }));
        if (this.entryObserver) {
            entry.setIntersecting(false);
            this.entryObserver.observe(entry.node);
        }
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
        this.pendingReveal = entry;
        entry.setCollapsed(false);
        entry.setIntersecting(true);
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

    updateEntriesScroll(): void {
        const scrollTop = this.entriesPanel.node.scrollTop;
        const toUpdate: { entry: DiffEntryWidget; offsetTop: number }[] = [];
        for (const entry of this.entryWidgets) {
            if (entry.isIntersecting && !entry.isCollapsed) {
                toUpdate.push({ entry, offsetTop: entry.node.offsetTop });
            }
        }
        for (const { entry, offsetTop } of toUpdate) {
            entry.updateScroll(scrollTop, offsetTop);
        }
    }

    protected override onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        const height = msg.height < 0 ? this.node.clientHeight : msg.height;
        if (height > 0) {
            for (const entry of this.entryWidgets) {
                entry.setAvailableHeight(height, this.entryWidgets.length === 1);
            }
            this.updateEntriesScroll();
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
