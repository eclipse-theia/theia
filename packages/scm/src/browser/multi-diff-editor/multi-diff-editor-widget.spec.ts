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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import * as sinon from 'sinon';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoDiffEditor } from '@theia/monaco/lib/browser/monaco-diff-editor';
import { MultiDiffEditorWidgetFactory } from './multi-diff-editor-widget-factory';
import { Emitter, URI } from '@theia/core';
import { LabelProvider, MessageLoop, Widget } from '@theia/core/lib/browser';
import { Container } from '@theia/core/shared/inversify';
import {
    DiffEntryErrorWidget,
    DiffEntryHeaderWidget,
    DiffEntryLoadingWidget,
    DiffEntryWidget,
    HEADER_HEIGHT,
    MIN_ENTRY_HEIGHT,
    MultiDiffEditor,
    MultiDiffEditorData,
    MultiDiffEditorLabelProvider,
    MultiDiffEditorOpenHandler
} from './multi-diff-editor';
import { MultiDiffEditorResourcePair, MultiDiffEditorUri } from './multi-diff-editor-uri';
import * as monaco from '@theia/monaco-editor-core';

disableJSDOM();

describe('Multi-Diff Editor — widgets', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    // Minimal LabelProvider mock — only the methods DiffEntryHeaderWidget uses.
    const mockLabelProvider = {
        getIcon: (_: URI) => 'codicon codicon-file',
        getName: (uri: URI) => uri.path.base,
        getLongName: (uri: URI) => uri.path.toString()
    } as unknown as LabelProvider;

    const sampleResource: MultiDiffEditorResourcePair = {
        originalUri: new URI('file:///workspace/a.ts'),
        modifiedUri: new URI('file:///workspace/b.ts')
    };

    /** A change of the given modified lines; an end line of 0 makes it a deletion after the start line. */
    function lineChange(start: number, end = start): monaco.editor.ILineChange {
        return { originalStartLineNumber: start, originalEndLineNumber: end, modifiedStartLineNumber: start, modifiedEndLineNumber: end, charChanges: undefined };
    }

    interface FakeDiffEditor {
        widget: EditorWidget;
        modified: { getPosition(): { lineNumber: number } | undefined; setPosition: sinon.SinonSpy; revealLineInCenterIfOutsideViewport: sinon.SinonSpy };
        /** Set the changes as if the diff editor computed its diff. */
        setLineChanges(changes: monaco.editor.ILineChange[]): void;
    }

    /** An editor widget with a diff editor that reports line changes, a cursor, and a line height of 20 pixels. */
    /** Without `changes`, the diff is not computed until {@link FakeDiffEditor.setLineChanges} is called. */
    function createFakeDiffEditor(changes?: monaco.editor.ILineChange[], lineCount = 100): FakeDiffEditor {
        const diffUpdated = new Emitter<void>();
        const cursorChanged = new Emitter<void>();
        let lineChanges = changes;
        let position: { lineNumber: number } | undefined;
        const sizeChanged = new Emitter<void>().event;
        const modified = {
            getContentHeight: () => lineCount * 20,
            onDidContentSizeChange: sizeChanged,
            getPosition: () => position,
            setPosition: sinon.spy((value: { lineNumber: number }) => {
                position = value;
                cursorChanged.fire();
            }),
            onDidChangeCursorPosition: cursorChanged.event,
            getModel: () => ({ getLineCount: () => lineCount }),
            revealLineInCenterIfOutsideViewport: sinon.spy(),
            getTopForLineNumber: (line: number) => (line - 1) * 20,
            getScrollTop: () => 0
        };
        const monacoEditor = Object.create(MonacoDiffEditor.prototype);
        Object.defineProperty(monacoEditor, 'diffEditor', {
            value: {
                updateOptions: () => { },
                getOriginalEditor: () => ({ getContentHeight: () => lineCount * 20, onDidContentSizeChange: sizeChanged }),
                getModifiedEditor: () => modified,
                getLineChanges: () => lineChanges,
                onDidUpdateDiff: diffUpdated.event
            }
        });
        const widget = new Widget() as EditorWidget;
        Object.defineProperty(widget, 'editor', { value: monacoEditor });
        return {
            widget,
            modified,
            setLineChanges: value => {
                lineChanges = value;
                diffUpdated.fire();
            }
        };
    }

    /** Let pending promise continuations run. */
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));

    describe('DiffEntryHeaderWidget', () => {

        it('should render icon, name and description', () => {
            const widget = new DiffEntryHeaderWidget(sampleResource, mockLabelProvider);
            try {
                expect(widget.node.querySelector('.multi-diff-entry-icon')).to.exist;
                expect(widget.node.querySelector('.multi-diff-entry-label')?.textContent).to.equal('b.ts');
                expect(widget.node.querySelector('.multi-diff-entry-description')?.textContent).to.equal('/workspace/b.ts');
            } finally {
                widget.dispose();
            }
        });

        it('should expose aria-expanded=true by default', () => {
            const widget = new DiffEntryHeaderWidget(sampleResource, mockLabelProvider);
            try {
                expect(widget.node.getAttribute('aria-expanded')).to.equal('true');
                expect(widget.node.querySelector('.codicon-chevron-down')).to.exist;
            } finally {
                widget.dispose();
            }
        });

        it('should toggle chevron and aria-expanded on setCollapsed', () => {
            const widget = new DiffEntryHeaderWidget(sampleResource, mockLabelProvider);
            try {
                widget.setCollapsed(true);
                expect(widget.node.getAttribute('aria-expanded')).to.equal('false');
                expect(widget.node.querySelector('.codicon-chevron-right')).to.exist;
                expect(widget.node.querySelector('.codicon-chevron-down')).to.be.null;

                widget.setCollapsed(false);
                expect(widget.node.getAttribute('aria-expanded')).to.equal('true');
                expect(widget.node.querySelector('.codicon-chevron-down')).to.exist;
            } finally {
                widget.dispose();
            }
        });

        it('should fire onDidToggleCollapse when clicked', () => {
            const widget = new DiffEntryHeaderWidget(sampleResource, mockLabelProvider);
            try {
                let fired = 0;
                widget.onDidToggleCollapse(() => fired++);
                widget.node.click();
                expect(fired).to.equal(1);
            } finally {
                widget.dispose();
            }
        });
    });

    describe('DiffEntryWidget', () => {

        function createEntry(): { entry: DiffEntryWidget; header: DiffEntryHeaderWidget } {
            const header = new DiffEntryHeaderWidget(sampleResource, mockLabelProvider);
            const entry = new DiffEntryWidget(sampleResource, header);
            return { entry, header };
        }

        it('should start in loading state with MIN_ENTRY_HEIGHT', () => {
            const { entry } = createEntry();
            try {
                expect(entry.editorWidget).to.be.undefined;
                expect(entry.isCollapsed).to.be.false;
                expect(entry.node.style.height).to.equal(`${MIN_ENTRY_HEIGHT}px`);
                expect(entry.node.querySelector('.multi-diff-entry-loading')).to.exist;
            } finally {
                entry.dispose();
            }
        });

        it('should transition to error state on setError', () => {
            const { entry } = createEntry();
            try {
                entry.setError('boom');
                expect(entry.node.querySelector('.multi-diff-entry-loading')).to.be.null;
                expect(entry.node.querySelector('.multi-diff-entry-error')?.textContent).to.contain('boom');
                expect(entry.editorWidget).to.be.undefined;
            } finally {
                entry.dispose();
            }
        });

        it('should fit short content and cap large entries before the viewport size is known', () => {
            const { entry } = createEntry();
            try {
                entry.setHeight(50);
                expect(entry.node.style.height).to.equal('50px');

                entry.setHeight(10_000);
                expect(entry.node.style.height).to.equal('5000px');

                entry.setHeight(MIN_ENTRY_HEIGHT + 42);
                expect(entry.node.style.height).to.equal(`${MIN_ENTRY_HEIGHT + 42}px`);
            } finally {
                entry.dispose();
            }
        });

        it('should shrink to HEADER_HEIGHT when collapsed and restore height when expanded', () => {
            const { entry } = createEntry();
            try {
                entry.setHeight(MIN_ENTRY_HEIGHT + 100);
                expect(entry.node.style.height).to.equal(`${MIN_ENTRY_HEIGHT + 100}px`);

                entry.setCollapsed(true);
                expect(entry.isCollapsed).to.be.true;
                expect(entry.node.style.height).to.equal(`${HEADER_HEIGHT}px`);

                entry.setCollapsed(false);
                expect(entry.isCollapsed).to.be.false;
                expect(entry.node.style.height).to.equal(`${MIN_ENTRY_HEIGHT + 100}px`);
            } finally {
                entry.dispose();
            }
        });

        it('should remember requested height while collapsed and apply it on expand', () => {
            const { entry } = createEntry();
            try {
                entry.setCollapsed(true);
                // setHeight while collapsed updates the remembered expanded height only.
                entry.setHeight(MIN_ENTRY_HEIGHT + 50);
                expect(entry.node.style.height).to.equal(`${HEADER_HEIGHT}px`);

                entry.setCollapsed(false);
                expect(entry.node.style.height).to.equal(`${MIN_ENTRY_HEIGHT + 50}px`);
            } finally {
                entry.dispose();
            }
        });

        it('should hide content when collapsed, including content loaded afterwards', () => {
            const { entry } = createEntry();
            try {
                entry.setCollapsed(true);
                expect(entry['currentContent'].isHidden).to.be.true;
                entry.setError('boom');
                expect(entry['currentContent'].isHidden).to.be.true;
                entry.setCollapsed(false);
                expect(entry['currentContent'].isHidden).to.be.false;
            } finally {
                entry.dispose();
            }
        });

        it('should retain the available height across content updates and collapse', () => {
            const { entry } = createEntry();
            try {
                entry.setAvailableHeight(800);
                entry.setHeight(200);
                expect(entry.node.style.height).to.equal('800px');
                entry.setCollapsed(true);
                entry.setAvailableHeight(600);
                expect(entry.node.style.height).to.equal(`${HEADER_HEIGHT}px`);
                entry.setCollapsed(false);
                expect(entry.node.style.height).to.equal('600px');
            } finally {
                entry.dispose();
            }
        });

        it('should be a no-op when setCollapsed is called with the current value', () => {
            const { entry } = createEntry();
            try {
                let fired = 0;
                entry.onDidChangeCollapsed(() => fired++);
                entry.setCollapsed(false);
                expect(fired).to.equal(0);
                entry.setCollapsed(true);
                expect(fired).to.equal(1);
                entry.setCollapsed(true);
                expect(fired).to.equal(1);
            } finally {
                entry.dispose();
            }
        });

        it('should toggle collapsed when the header fires onDidToggleCollapse', () => {
            const { entry, header } = createEntry();
            try {
                expect(entry.isCollapsed).to.be.false;
                header.node.click();
                expect(entry.isCollapsed).to.be.true;
                header.node.click();
                expect(entry.isCollapsed).to.be.false;
            } finally {
                entry.dispose();
            }
        });
    });

    describe('entry loading', () => {

        function createEntry(load: () => Promise<EditorWidget>): DiffEntryWidget {
            return new DiffEntryWidget(sampleResource, new DiffEntryHeaderWidget(sampleResource, mockLabelProvider), load);
        }

        it('should skip collapsed entries, load on expansion, and suppress concurrent or repeated loads', async () => {
            let resolve!: (widget: EditorWidget) => void;
            const load = sinon.stub().returns(new Promise<EditorWidget>(r => resolve = r));
            const entry = createEntry(load);
            const widget = new Widget() as EditorWidget;
            try {
                entry.setCollapsed(true);
                await entry.loadEditor();
                expect(load.callCount).to.equal(0);
                entry.setCollapsed(false);
                await entry.loadEditor();
                expect(load.callCount).to.equal(1);
                entry.setCollapsed(true);
                resolve(widget);
                await Promise.resolve();
                expect(entry.editorWidget).to.equal(widget);
                expect(widget.isHidden).to.be.true;
                entry.setCollapsed(false);
                await entry.loadEditor();
                expect(load.callCount).to.equal(1);
            } finally {
                entry.dispose();
            }
        });

        it('should offer a native Retry button, restore loading state, and serialize retries', async () => {
            let resolve!: (widget: EditorWidget) => void;
            const load = sinon.stub();
            load.onFirstCall().rejects(new Error('provider unavailable'));
            load.onSecondCall().returns(new Promise<EditorWidget>(r => resolve = r));
            const entry = createEntry(load);
            const widget = new Widget() as EditorWidget;
            try {
                await entry.loadEditor();
                const button = entry.node.querySelector('button')!;
                expect(button.textContent).to.equal('Retry');
                expect(button.type).to.equal('button');
                await entry.loadEditor();
                expect(load.callCount).to.equal(1);
                button.click();
                expect(entry.node.querySelector('.multi-diff-entry-loading')).to.exist;
                button.click();
                await entry.loadEditor(true);
                expect(load.callCount).to.equal(2);
                resolve(widget);
                await Promise.resolve();
                expect(entry.editorWidget).to.equal(widget);
            } finally {
                entry.dispose();
            }
        });

        it('should dispose editors completing after disposal without emitting a load event', async () => {
            let resolve!: (widget: EditorWidget) => void;
            const entry = createEntry(() => new Promise(r => resolve = r));
            const loaded = sinon.spy();
            entry.onDidLoadEditor(loaded);
            const pending = entry.loadEditor();
            entry.dispose();
            const widget = new Widget() as EditorWidget;
            resolve(widget);
            await pending;
            expect(widget.isDisposed).to.be.true;
            expect(loaded.called).to.be.false;
        });

        it('should ignore rejected loads after disposal', async () => {
            let reject!: (error: Error) => void;
            const entry = createEntry(() => new Promise((_resolve, r) => reject = r));
            const setError = sinon.spy(entry, 'setError');
            const pending = entry.loadEditor();
            entry.dispose();
            reject(new Error('late failure'));
            await pending;
            expect(setError.called).to.be.false;
        });

        it('should expand without loading on request, and wait for an in-flight load and the computed diff', async () => {
            let resolve!: (widget: EditorWidget) => void;
            const load = sinon.stub().returns(new Promise<EditorWidget>(r => resolve = r));
            const entry = createEntry(load);
            const fake = createFakeDiffEditor();
            try {
                entry.setCollapsed(true);
                expect(await entry.waitForLineChanges()).to.be.undefined;
                entry.setCollapsed(false, false);
                expect(entry.isCollapsed).to.be.false;
                expect(load.called).to.be.false;
                entry.loadEditor();
                let changes: readonly monaco.editor.ILineChange[] | undefined;
                const waiting = entry.waitForLineChanges().then(result => changes = result);
                resolve(fake.widget);
                await flush();
                expect(load.calledOnce).to.be.true;
                expect(entry.lineChanges).to.be.undefined;
                expect(changes).to.be.undefined;
                fake.setLineChanges([lineChange(4)]);
                await waiting;
                expect(changes).to.deep.equal([lineChange(4)]);
                expect(await entry.waitForLineChanges()).to.deep.equal([lineChange(4)]);
            } finally {
                entry.dispose();
            }
        });

        it('should stop waiting for the diff when the entry is disposed', async () => {
            const fake = createFakeDiffEditor();
            const entry = createEntry(async () => fake.widget);
            const waiting = entry.waitForLineChanges();
            await flush();
            entry.dispose();
            expect(await waiting).to.be.undefined;
        });

        it('should track both diff content heights as unchanged regions are hidden or expanded and dispose listeners', () => {
            const originalChanged = new Emitter<void>();
            const modifiedChanged = new Emitter<void>();
            let originalHeight = 300;
            let modifiedHeight = 400;
            const monacoEditor = Object.create(MonacoDiffEditor.prototype);
            Object.defineProperty(monacoEditor, 'diffEditor', {
                value: {
                    updateOptions: sinon.spy(),
                    getOriginalEditor: () => ({ getContentHeight: () => originalHeight, onDidContentSizeChange: originalChanged.event }),
                    getModifiedEditor: () => ({ getContentHeight: () => modifiedHeight, onDidContentSizeChange: modifiedChanged.event })
                }
            });
            const widget = new Widget() as EditorWidget;
            Object.defineProperty(widget, 'editor', { value: monacoEditor });
            const entry = createEntry(async () => widget);
            try {
                entry.setEditor(widget);
                expect(entry.node.style.height).to.equal(`${400 + HEADER_HEIGHT}px`);
                originalHeight = 140;
                modifiedHeight = 150;
                modifiedChanged.fire();
                expect(entry.node.style.height).to.equal(`${150 + HEADER_HEIGHT}px`);
                entry.setCollapsed(true);
                originalHeight = 350;
                originalChanged.fire();
                expect(entry.node.style.height).to.equal(`${HEADER_HEIGHT}px`);
                entry.setCollapsed(false);
                expect(entry.node.style.height).to.equal(`${350 + HEADER_HEIGHT}px`);
                entry.dispose();
                const setHeight = sinon.spy(entry, 'setHeight');
                originalChanged.fire();
                modifiedChanged.fire();
                expect(setHeight.called).to.be.false;
            } finally {
                entry.dispose();
                originalChanged.dispose();
                modifiedChanged.dispose();
            }
        });
    });

    describe('content-fit sizing and inner scrolling', () => {
        for (const isDiff of [false, true]) {
            it(`should release vertical wheel events at ${isDiff ? 'diff' : 'code'} boundaries without preventing outer scrolling`, () => {
                const changed = new Emitter<void>();
                let scrollTop = 0;
                let contentHeight = 6000;
                const control = {
                    getContentHeight: () => contentHeight,
                    onDidContentSizeChange: changed.event,
                    updateOptions: sinon.spy(),
                    getScrollTop: () => scrollTop,
                    getScrollHeight: () => 6000,
                    getLayoutInfo: () => ({ height: 1000 })
                };
                const monacoEditor = Object.create(isDiff ? MonacoDiffEditor.prototype : MonacoEditor.prototype);
                if (isDiff) {
                    Object.defineProperty(monacoEditor, 'diffEditor', {
                        value: { getOriginalEditor: () => control, getModifiedEditor: () => control, updateOptions: control.updateOptions }
                    });
                } else {
                    monacoEditor.getControl = () => control;
                }
                const widget = new Widget() as EditorWidget;
                Object.defineProperty(widget, 'editor', { value: monacoEditor });
                const entry = new DiffEntryWidget(sampleResource, new DiffEntryHeaderWidget(sampleResource, mockLabelProvider));
                const targets = Array.from({ length: isDiff ? 2 : 1 }, () => {
                    const node = document.createElement('div');
                    widget.node.appendChild(node);
                    node.addEventListener('wheel', event => event.preventDefault());
                    return node;
                });
                const wheel = (target: HTMLElement, deltaY: number, options: WheelEventInit = {}) => {
                    const event = new window.WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, ...options });
                    target.dispatchEvent(event);
                    return event.defaultPrevented;
                };
                try {
                    entry.setEditor(widget);
                    for (const target of targets) {
                        scrollTop = 0;
                        expect(wheel(target, -100)).to.be.false;
                        expect(wheel(target, 100)).to.be.true;
                        scrollTop = 2500;
                        expect(wheel(target, -100)).to.be.true;
                        expect(wheel(target, 100)).to.be.true;
                        scrollTop = 5000;
                        expect(wheel(target, 100)).to.be.false;
                        expect(wheel(target, -100)).to.be.true;
                        expect(wheel(target, 100, { deltaX: 200 })).to.be.true;
                        expect(wheel(target, 100, { ctrlKey: true })).to.be.true;
                        expect(wheel(target, 100, { shiftKey: true })).to.be.true;
                    }
                    contentHeight = 20;
                    changed.fire();
                    expect(wheel(targets[0], 100)).to.be.true;
                    entry.dispose();
                    expect(wheel(targets[0], 100)).to.be.true;
                } finally {
                    entry.dispose();
                    changed.dispose();
                }
            });

            it(`should size ${isDiff ? 'diff' : 'code'} content including borders and toggle scrolling on content changes and resizes`, () => {
                const changed = new Emitter<void>();
                const originalChanged = new Emitter<void>();
                let contentHeight = 20;
                let originalHeight = 10;
                const updateOptions = sinon.spy((_options: unknown) => changed.fire());
                const control = {
                    getContentHeight: () => contentHeight,
                    onDidContentSizeChange: changed.event,
                    updateOptions
                };
                const monacoEditor = Object.create(isDiff ? MonacoDiffEditor.prototype : MonacoEditor.prototype);
                if (isDiff) {
                    Object.defineProperty(monacoEditor, 'diffEditor', {
                        value: {
                            getOriginalEditor: () => ({ getContentHeight: () => originalHeight, onDidContentSizeChange: originalChanged.event }),
                            getModifiedEditor: () => control,
                            updateOptions
                        }
                    });
                } else {
                    monacoEditor.getControl = () => control;
                }
                const widget = new Widget() as EditorWidget;
                Object.defineProperty(widget, 'editor', { value: monacoEditor });
                const entry = new DiffEntryWidget(sampleResource, new DiffEntryHeaderWidget(sampleResource, mockLabelProvider));
                entry.node.style.border = '1px solid black';
                Widget.attach(entry, document.body);
                const chrome = HEADER_HEIGHT + 2;
                const expectScrolling = (enabled: boolean) => expect(updateOptions.lastCall.args[0]).to.deep.equal({
                    scrollbar: { vertical: enabled ? 'auto' : 'hidden', handleMouseWheel: enabled, alwaysConsumeMouseWheel: false }
                });
                try {
                    entry.setAvailableHeight(250, false);
                    entry.setEditor(widget);
                    expect(entry.node.style.height).to.equal(`${20 + chrome}px`);
                    expectScrolling(false);
                    expect(updateOptions.callCount).to.equal(1);
                    changed.fire();
                    expect(updateOptions.callCount).to.equal(1);

                    contentHeight = 6000;
                    changed.fire();
                    expect(entry.node.style.height).to.equal('5000px');
                    expectScrolling(true);
                    expect(updateOptions.callCount).to.equal(2);

                    entry.setAvailableHeight(600, false);
                    expect(entry.node.style.height).to.equal('5000px');
                    expectScrolling(true);
                    expect(updateOptions.callCount).to.equal(2);
                    contentHeight = 400;
                    changed.fire();
                    expect(entry.node.style.height).to.equal(`${400 + chrome}px`);
                    expectScrolling(false);
                    entry.setAvailableHeight(200, false);
                    expect(entry.node.style.height).to.equal(`${400 + chrome}px`);
                    expectScrolling(false);
                    contentHeight = 5000 - chrome;
                    changed.fire();
                    expect(entry.node.style.height).to.equal('5000px');
                    expectScrolling(false);
                    contentHeight++;
                    changed.fire();
                    expect(entry.node.style.height).to.equal('5000px');
                    expectScrolling(true);

                    entry.setCollapsed(true);
                    expect(entry.node.style.height).to.equal(`${chrome}px`);
                    entry.setAvailableHeight(100, false);
                    contentHeight = 20;
                    changed.fire();
                    expect(entry.node.style.height).to.equal(`${chrome}px`);
                    entry.setCollapsed(false);
                    expect(entry.node.style.height).to.equal(`${20 + chrome}px`);
                    expectScrolling(false);

                    if (isDiff) {
                        originalHeight = 500;
                        originalChanged.fire();
                        expect(entry.node.style.height).to.equal(`${500 + chrome}px`);
                        expectScrolling(false);
                        originalHeight = 10;
                        originalChanged.fire();
                        expect(entry.node.style.height).to.equal(`${20 + chrome}px`);
                        expectScrolling(false);
                    }
                    entry.setAvailableHeight(500);
                    expect(entry.node.style.height).to.equal('500px');
                    expectScrolling(false);
                    contentHeight = 600;
                    changed.fire();
                    expect(entry.node.style.height).to.equal('500px');
                    expectScrolling(true);
                    entry.setAvailableHeight(700);
                    expect(entry.node.style.height).to.equal('700px');
                    expectScrolling(false);
                } finally {
                    entry.dispose();
                    changed.dispose();
                    originalChanged.dispose();
                }
            });
        }
    });

    describe('DiffEntryLoadingWidget / DiffEntryErrorWidget', () => {

        it('should render a spinning codicon loading indicator', () => {
            const w = new DiffEntryLoadingWidget();
            try {
                const spinner = w.node.querySelector('.codicon-loading.codicon-modifier-spin');
                expect(spinner).to.exist;
            } finally {
                w.dispose();
            }
        });

        it('should render the error message', () => {
            const w = new DiffEntryErrorWidget('oops');
            try {
                expect(w.node.textContent).to.contain('oops');
                expect(w.node.querySelector('.codicon-error')).to.exist;
            } finally {
                w.dispose();
            }
        });
    });

    describe('MultiDiffEditor', () => {

        function createEditor(count: number, load?: () => Promise<EditorWidget>): MultiDiffEditor {
            const container = new Container();
            container.bind(MultiDiffEditorData).toConstantValue({ title: 'Changes', resources: Array(count).fill(sampleResource) });
            container.bind(MultiDiffEditor).toSelf();
            const editor = container.get(MultiDiffEditor);
            for (let index = 0; index < count; index++) {
                editor.addDiffEntry(sampleResource, new DiffEntryHeaderWidget(sampleResource, mockLabelProvider), load);
            }
            return editor;
        }

        it('should opt out of persistence and ignore restore state', () => {
            const editor = createEditor(1);
            try {
                editor.restoreState({ collapsedUris: [sampleResource.modifiedUri.toString()], scrollTop: 123 });
                expect(editor.entries[0].isCollapsed).to.be.false;
                expect(editor['entriesPanel'].node.scrollTop).to.equal(0);
                expect(editor.storeState()).to.be.undefined;
            } finally {
                editor.dispose();
            }
        });

        it('should observe near-viewport entries, skip collapsed entries, and disconnect safely', async () => {
            const previous = globalThis.IntersectionObserver;
            let callback!: IntersectionObserverCallback;
            const observe = sinon.spy();
            const disconnect = sinon.spy();
            let options: IntersectionObserverInit | undefined;
            globalThis.IntersectionObserver = class {
                constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
                    callback = cb;
                    options = opts;
                }
                observe = observe;
                disconnect = disconnect;
            } as unknown as typeof IntersectionObserver;
            const load = sinon.stub().callsFake(async () => new Widget() as EditorWidget);
            const editor = createEditor(2, load);
            const firstLoad = sinon.spy(editor.entries[0], 'loadEditor');
            const secondLoad = sinon.spy(editor.entries[1], 'loadEditor');
            try {
                expect(observe.callCount).to.equal(2);
                expect(options?.root).to.equal(editor['entriesPanel'].node);
                expect(options?.rootMargin).to.equal('500px 0px');
                editor.entries[1].setCollapsed(true);
                const records = editor.entries.map(entry => ({ target: entry.node, isIntersecting: true } as unknown as IntersectionObserverEntry));
                callback([{ ...records[0], isIntersecting: false }], editor['entryObserver']!);
                expect(firstLoad.called).to.be.false;
                callback(records, editor['entryObserver']!);
                expect(firstLoad.calledOnce).to.be.true;
                expect(editor.entries[1].editorWidget).to.be.undefined;
                expect(load.calledOnce).to.be.true;
                await Promise.resolve();
                expect(editor.entries[0].editorWidget).to.exist;
                editor.entries[1].setCollapsed(false);
                await Promise.resolve();
                expect(load.calledTwice).to.be.true;
                expect(editor.entries[1].editorWidget).to.exist;
                editor.dispose();
                expect(disconnect.calledOnce).to.be.true;
                callback(records, editor['entryObserver']!);
                expect(firstLoad.calledOnce).to.be.true;
                expect(secondLoad.calledTwice).to.be.true;
                expect(load.calledTwice).to.be.true;
            } finally {
                editor.dispose();
                globalThis.IntersectionObserver = previous;
            }
        });

        it('should expand and load explicitly revealed entries', () => {
            const previous = globalThis.requestAnimationFrame;
            globalThis.requestAnimationFrame = sinon.stub().returns(0);
            const editor = createEditor(1);
            const load = sinon.spy(editor.entries[0], 'loadEditor');
            try {
                editor.entries[0].setCollapsed(true);
                editor.revealResource(sampleResource.modifiedUri);
                expect(editor.entries[0].isCollapsed).to.be.false;
                expect(load.called).to.be.true;
            } finally {
                editor.dispose();
                globalThis.requestAnimationFrame = previous;
            }
        });

        it('should reveal only within the entries panel and repeat after an in-flight target loads', async () => {
            const previous = globalThis.requestAnimationFrame;
            const frames: FrameRequestCallback[] = [];
            globalThis.requestAnimationFrame = callback => frames.push(callback);
            let resolve!: (widget: EditorWidget) => void;
            const editor = createEditor(1, () => new Promise(r => resolve = r));
            const entry = editor.entries[0];
            const panel = editor['entriesPanel'].node;
            const offset = sinon.stub(entry.node, 'offsetTop').get(() => 120);
            const pending = entry.loadEditor();
            try {
                Widget.attach(editor, document.body);
                editor.node.scrollTop = 42;
                document.body.scrollTop = 17;
                editor.revealResource(entry.modifiedUri);
                frames.splice(0).forEach(frame => frame(0));
                expect(panel.scrollTop).to.equal(120);
                expect(editor.node.scrollTop).to.equal(42);
                expect(document.body.scrollTop).to.equal(17);
                offset.get(() => 480);
                resolve(new Widget() as EditorWidget);
                await pending;
                frames.splice(0).forEach(frame => frame(0));
                expect(panel.scrollTop).to.equal(480);
                expect(editor.node.scrollTop).to.equal(42);
                expect(document.body.scrollTop).to.equal(17);
            } finally {
                editor.dispose();
                offset.restore();
                document.body.scrollTop = 0;
                globalThis.requestAnimationFrame = previous;
            }
        });

        it('should ignore stale reveal frames and frames after disposal', () => {
            const previous = globalThis.requestAnimationFrame;
            const frames: FrameRequestCallback[] = [];
            globalThis.requestAnimationFrame = callback => frames.push(callback);
            const editor = createEditor(1);
            const otherResource = { ...sampleResource, modifiedUri: new URI('file:///workspace/c.ts') };
            const other = editor.addDiffEntry(otherResource, new DiffEntryHeaderWidget(otherResource, mockLabelProvider));
            const panel = editor['entriesPanel'].node;
            const offset = sinon.stub(other.node, 'offsetTop').get(() => 240);
            try {
                Widget.attach(editor, document.body);
                editor.revealResource(sampleResource.modifiedUri);
                editor.revealResource(otherResource.modifiedUri);
                frames.shift()!(0);
                expect(panel.scrollTop).to.equal(0);
                frames.shift()!(0);
                expect(panel.scrollTop).to.equal(240);
                editor.revealResource(sampleResource.modifiedUri);
                editor.dispose();
                frames.splice(0).forEach(frame => frame(0));
                expect(panel.scrollTop).to.equal(240);
            } finally {
                editor.dispose();
                offset.restore();
                globalThis.requestAnimationFrame = previous;
            }
        });

        it('should activate a visible editor, remember focused entries, and preserve ancestor scroll positions', () => {
            const editor = createEditor(2);
            const panel = editor['entriesPanel'].node;
            sinon.stub(panel, 'getBoundingClientRect').returns({ top: 0, bottom: 500 } as DOMRect);
            const firstBounds = sinon.stub(editor.entries[0].node, 'getBoundingClientRect').returns({ top: -400, bottom: -100 } as DOMRect);
            sinon.stub(editor.entries[1].node, 'getBoundingClientRect').returns({ top: 100, bottom: 400 } as DOMRect);
            class FocusWidget extends Widget {
                protected override onActivateRequest(): void {
                    panel.scrollTop = 0;
                    editor.node.scrollTop = 0;
                }
            }
            const first = new FocusWidget() as unknown as EditorWidget;
            const second = new FocusWidget() as unknown as EditorWidget;
            editor.entries[0].setEditor(first);
            editor.entries[1].setEditor(second);
            const firstActivate = sinon.spy(first, 'processMessage');
            const secondActivate = sinon.spy(second, 'processMessage');
            try {
                panel.scrollTop = 350;
                editor.node.scrollTop = 42;
                MessageLoop.sendMessage(editor, Widget.Msg.ActivateRequest);
                expect(firstActivate.calledWith(Widget.Msg.ActivateRequest)).to.be.false;
                expect(secondActivate.calledWith(Widget.Msg.ActivateRequest)).to.be.true;
                expect(panel.scrollTop).to.equal(350);
                expect(editor.node.scrollTop).to.equal(42);
                second.node.dispatchEvent(new window.Event('focusin', { bubbles: true }));
                firstBounds.returns({ top: 0, bottom: 200 } as DOMRect);
                secondActivate.resetHistory();
                MessageLoop.sendMessage(editor, Widget.Msg.ActivateRequest);
                expect(secondActivate.calledWith(Widget.Msg.ActivateRequest)).to.be.true;
                editor.entries[1].setCollapsed(true);
                MessageLoop.sendMessage(editor, Widget.Msg.ActivateRequest);
                expect(panel.scrollTop).to.equal(350);
            } finally {
                sinon.restore();
                editor.dispose();
            }
        });

        it('should fill the viewport for a single entry and follow resizes', () => {
            const editor = createEditor(1);
            try {
                MessageLoop.sendMessage(editor, new Widget.ResizeMessage(1000, 800));
                expect(editor.entries[0].node.style.height).to.equal('800px');
                MessageLoop.sendMessage(editor, new Widget.ResizeMessage(1000, 400));
                expect(editor.entries[0].node.style.height).to.equal('400px');
            } finally {
                editor.dispose();
            }
        });

        it('should retain bounded content heights for multiple entries', () => {
            const editor = createEditor(2);
            try {
                MessageLoop.sendMessage(editor, new Widget.ResizeMessage(1000, 800));
                for (const entry of editor.entries) {
                    entry.setHeight(1000);
                    expect(entry.node.style.height).to.equal('1000px');
                    entry.setHeight(10_000);
                    expect(entry.node.style.height).to.equal('5000px');
                }
                MessageLoop.sendMessage(editor, new Widget.ResizeMessage(1000, 300));
                expect(editor.entries[0].node.style.height).to.equal('5000px');
                editor.entries[1].setHeight(60);
                expect(editor.entries[1].node.style.height).to.equal('60px');
            } finally {
                editor.dispose();
            }
        });

        function addEntry(editor: MultiDiffEditor, load?: () => Promise<EditorWidget>): DiffEntryWidget {
            return editor.addDiffEntry(sampleResource, new DiffEntryHeaderWidget(sampleResource, mockLabelProvider), load);
        }

        function headerOf(entry: DiffEntryWidget): Element | undefined {
            return entry.node.querySelector('.multi-diff-entry-header') ?? undefined;
        }

        it('should go to files in order, expand and load them, and focus their headers', () => {
            const previous = globalThis.requestAnimationFrame;
            globalThis.requestAnimationFrame = sinon.stub().returns(0);
            const editor = createEditor(3, () => new Promise<EditorWidget>(() => { }));
            const [first, second, third] = editor.entries;
            const changed = sinon.spy();
            editor.onDidChangeNavigationState(changed);
            try {
                Widget.attach(editor, document.body);
                second.setCollapsed(true);
                const secondLoad = sinon.spy(second, 'loadEditor');
                expect(editor.hasPreviousEntry()).to.be.false;
                expect(editor.hasNextEntry()).to.be.true;
                editor.goToPreviousEntry();
                expect(document.activeElement).to.equal(document.body);
                changed.resetHistory();
                editor.goToNextEntry();
                expect(document.activeElement).to.equal(headerOf(first));
                expect(changed.called).to.be.true;
                expect(editor.hasPreviousEntry()).to.be.false;
                editor.goToNextEntry();
                expect(document.activeElement).to.equal(headerOf(second));
                expect(second.isCollapsed).to.be.false;
                expect(secondLoad.called).to.be.true;
                editor.goToNextEntry();
                expect(editor.hasNextEntry()).to.be.false;
                editor.goToNextEntry();
                expect(document.activeElement).to.equal(headerOf(third));
                editor.goToPreviousEntry();
                expect(document.activeElement).to.equal(headerOf(second));
                expect(editor.hasPreviousEntry()).to.be.true;
            } finally {
                editor.dispose();
                globalThis.requestAnimationFrame = previous;
            }
        });

        it('should go to changes across entries, load collapsed entries, and skip entries without changes', async () => {
            const previous = globalThis.requestAnimationFrame;
            const frames: FrameRequestCallback[] = [];
            globalThis.requestAnimationFrame = callback => frames.push(callback);
            const fakes = [createFakeDiffEditor([lineChange(3, 4), lineChange(10, 12)]), createFakeDiffEditor([]), createFakeDiffEditor()];
            const editor = createEditor(0);
            const entries = fakes.map(fake => addEntry(editor, async () => fake.widget));
            const panel = editor['entriesPanel'].node;
            try {
                await entries[0].loadEditor();
                entries[2].setCollapsed(true);
                Widget.attach(editor, document.body);
                await flush();
                sinon.stub(panel, 'clientHeight').get(() => 200);
                sinon.stub(panel, 'getBoundingClientRect').returns({ top: 50 } as DOMRect);
                sinon.stub(fakes[0].widget.node, 'getBoundingClientRect').returns({ top: 350 } as DOMRect);
                const activate = sinon.spy(fakes[0].widget, 'processMessage');
                expect(editor.hasPreviousChange()).to.be.false;
                expect(editor.hasNextChange()).to.be.true;

                await editor.goToNextChange();
                expect(fakes[0].modified.getPosition()?.lineNumber).to.equal(3);
                expect(activate.calledWith(Widget.Msg.ActivateRequest)).to.be.true;
                frames.splice(0).forEach(frame => frame(0));
                expect(fakes[0].modified.revealLineInCenterIfOutsideViewport.calledWith(3)).to.be.true;
                // The editor starts 300 pixels below the top of the panel, and line 3 starts 40 pixels into the editor.
                expect(panel.scrollTop).to.equal(300 + 40 - 200 / 2);

                await editor.goToNextChange();
                expect(fakes[0].modified.getPosition()?.lineNumber).to.equal(10);
                expect(editor.hasPreviousChange()).to.be.true;

                // The second entry has no changes, and the third entry is collapsed and still computes its diff.
                const pending = editor.goToNextChange();
                await flush();
                expect(entries[2].isCollapsed).to.be.false;
                expect(document.activeElement).to.equal(headerOf(entries[2]));
                expect(fakes[2].modified.setPosition.called).to.be.false;
                fakes[2].setLineChanges([lineChange(5, 0)]);
                await pending;
                // A deletion after line 5 starts at line 6, as in Monaco's diff navigation.
                expect(fakes[2].modified.getPosition()?.lineNumber).to.equal(6);
                expect(editor.hasNextChange()).to.be.false;

                await editor.goToPreviousChange();
                expect(fakes[0].modified.setPosition.lastCall.args[0]).to.deep.equal({ lineNumber: 10, column: 1 });
                await editor.goToPreviousChange();
                expect(fakes[0].modified.getPosition()?.lineNumber).to.equal(3);
                expect(editor.hasPreviousChange()).to.be.false;

                // From a header, the next change is the first change of that entry, and the previous change is in an earlier entry.
                editor.goToNextEntry();
                editor.goToNextEntry();
                expect(editor.hasPreviousChange()).to.be.true;
                await editor.goToPreviousChange();
                expect(fakes[0].modified.getPosition()?.lineNumber).to.equal(10);
                editor.goToNextEntry();
                editor.goToNextEntry();
                fakes[2].modified.setPosition.resetHistory();
                await editor.goToNextChange();
                expect(fakes[2].modified.setPosition.calledOnceWith({ lineNumber: 6, column: 1 })).to.be.true;
            } finally {
                sinon.restore();
                editor.dispose();
                globalThis.requestAnimationFrame = previous;
            }
        });

        it('should stop going to a change when the focus moves to another entry while the target loads', async () => {
            const previous = globalThis.requestAnimationFrame;
            globalThis.requestAnimationFrame = sinon.stub().returns(0);
            let resolve!: (widget: EditorWidget) => void;
            const first = createFakeDiffEditor([lineChange(1)]);
            const second = createFakeDiffEditor([lineChange(2)]);
            const editor = createEditor(0);
            const entries = [addEntry(editor, async () => first.widget), addEntry(editor, () => new Promise(r => resolve = r))];
            try {
                await entries[0].loadEditor();
                await editor.goToNextChange();
                const pending = editor.goToNextChange();
                await flush();
                first.widget.node.dispatchEvent(new window.Event('focusin', { bubbles: true }));
                resolve(second.widget);
                await pending;
                expect(second.modified.setPosition.called).to.be.false;
                expect(first.modified.setPosition.calledOnce).to.be.true;
            } finally {
                editor.dispose();
                globalThis.requestAnimationFrame = previous;
            }
        });

        it('should collapse all entries and expand them without loading editors far from the viewport', () => {
            const previous = globalThis.IntersectionObserver;
            let callback!: IntersectionObserverCallback;
            const observe = sinon.spy();
            const unobserve = sinon.spy();
            globalThis.IntersectionObserver = class {
                constructor(cb: IntersectionObserverCallback) {
                    callback = cb;
                }
                observe = observe;
                unobserve = unobserve;
                disconnect(): void { }
            } as unknown as typeof IntersectionObserver;
            const load = sinon.stub().callsFake(async () => new Widget() as EditorWidget);
            const editor = createEditor(3, load);
            const changed = sinon.spy();
            editor.onDidChangeNavigationState(changed);
            try {
                expect(editor.areAllEntriesCollapsed()).to.be.false;
                editor.collapseAll();
                expect(editor.areAllEntriesCollapsed()).to.be.true;
                expect(changed.callCount).to.equal(3);
                observe.resetHistory();
                editor.expandAll();
                expect(editor.entries.some(entry => entry.isCollapsed)).to.be.false;
                expect(load.called).to.be.false;
                expect(unobserve.callCount).to.equal(3);
                expect(observe.args.map(args => args[0]).every((node, index) => node === editor.entries[index].node)).to.be.true;
                const records = [
                    { target: editor.entries[0].node, isIntersecting: true },
                    { target: editor.entries[1].node, isIntersecting: false }
                ] as unknown as IntersectionObserverEntry[];
                callback(records, editor['entryObserver']!);
                expect(load.calledOnce).to.be.true;
            } finally {
                editor.dispose();
                globalThis.IntersectionObserver = previous;
            }
        });

        it('should load all expanded entries when there is no intersection observer', () => {
            const load = sinon.stub().callsFake(async () => new Widget() as EditorWidget);
            const editor = createEditor(2, load);
            try {
                expect(editor['entryObserver']).to.be.undefined;
                editor.collapseAll();
                editor.expandAll();
                expect(load.calledTwice).to.be.true;
            } finally {
                editor.dispose();
            }
        });

        it('should treat entries without a computed diff as entries with changes', async () => {
            const fake = createFakeDiffEditor();
            const editor = createEditor(0);
            const entry = addEntry(editor, async () => fake.widget);
            const changed = sinon.spy();
            editor.onDidChangeNavigationState(changed);
            try {
                expect(editor.hasNextChange()).to.be.true;
                await entry.loadEditor();
                expect(editor.hasNextChange()).to.be.true;
                changed.resetHistory();
                fake.setLineChanges([]);
                expect(changed.calledOnce).to.be.true;
                expect(editor.hasNextChange()).to.be.false;
                expect(editor.hasPreviousChange()).to.be.false;
            } finally {
                editor.dispose();
            }
        });
    });

    describe('MultiDiffEditorWidgetFactory', () => {

        class TestFactory extends MultiDiffEditorWidgetFactory {
            configure(widget: EditorWidget): void {
                this.configureEmbeddedEditor(widget);
            }
        }

        it('should disable visibility side effects and enable unchanged-region hiding only for diff editors', () => {
            const factory = new TestFactory(new Container(), {} as EditorManager, mockLabelProvider);
            const diff = Object.create(MonacoDiffEditor.prototype);
            const updateDiffOptions = sinon.spy();
            Object.defineProperty(diff, 'diffEditor', { value: { updateOptions: updateDiffOptions } });
            const code = Object.create(MonacoEditor.prototype);
            const updateCodeOptions = sinon.spy();
            code.getControl = () => ({ updateOptions: updateCodeOptions });
            factory.configure({ editor: diff } as EditorWidget);
            factory.configure({ editor: code } as EditorWidget);
            for (const editor of [diff, code]) {
                expect(editor.detachModelOnHide).to.be.false;
            }
            expect(updateDiffOptions.firstCall.args[0]).to.deep.equal({
                folding: false, codeLens: false, scrollBeyondLastLine: false, stickyScroll: { enabled: false }, minimap: { enabled: false }, hideUnchangedRegions: { enabled: true }
            });
            expect(updateCodeOptions.firstCall.args[0]).not.to.have.property('hideUnchangedRegions');
        });

        it('should return placeholders without loading models, then configure and publish loaded editors', async () => {
            const widget = new Widget() as EditorWidget;
            const createByUri = sinon.stub().resolves(widget);
            const manager = { createByUri } as unknown as EditorManager;
            const factory = new MultiDiffEditorWidgetFactory(new Container(), manager, mockLabelProvider);
            const editor = factory.createMultiDiffEditor(MultiDiffEditorUri.encode({ title: 'Changes', resources: [sampleResource] }));
            const changed = sinon.spy();
            editor.onDidChangeTrackableWidgets(changed);
            try {
                expect(createByUri.called).to.be.false;
                expect(editor.entries[0].node.querySelector('.multi-diff-entry-loading')).to.exist;
                await editor.entries[0].loadEditor();
                expect(createByUri.calledOnce).to.be.true;
                expect(editor.getTrackableWidgets()).to.deep.equal([widget]);
                expect(changed.calledOnce).to.be.true;
            } finally {
                editor.dispose();
            }
        });
    });

    describe('MultiDiffEditorLabelProvider', () => {

        it('should label synthetic URIs with the full editor title', () => {
            const provider = new MultiDiffEditorLabelProvider();
            const uri = MultiDiffEditorUri.encode({ title: 'Changes in feature/test', resources: [] });
            expect(provider.canHandle(uri)).to.equal(20);
            expect(provider.canHandle(new URI('file:///a.ts'))).to.equal(0);
            expect(provider.getName(uri)).to.equal('Changes in feature/test');
            expect(provider.getLongName(uri)).to.equal('Changes in feature/test');
            expect(provider.getIcon()).to.equal('codicon codicon-diff-multiple');
        });
    });

    describe('MultiDiffEditorOpenHandler', () => {

        // canHandle can be exercised without DI, since it's a pure function of the URI.
        const handler = Object.create(MultiDiffEditorOpenHandler.prototype) as MultiDiffEditorOpenHandler;

        it('should return 1000 for multi-diff-editor URIs', () => {
            const uri = MultiDiffEditorUri.encode({ title: 'x', resources: [] });
            expect(handler.canHandle(uri)).to.equal(1000);
        });

        it('should return 0 for other URIs', () => {
            expect(handler.canHandle(new URI('file:///a.ts'))).to.equal(0);
            expect(handler.canHandle(new URI('diff://a/b'))).to.equal(0);
        });
    });
});
