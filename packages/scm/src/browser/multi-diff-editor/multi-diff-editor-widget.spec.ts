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
    MAX_ENTRY_HEIGHT,
    MIN_ENTRY_HEIGHT,
    MultiDiffEditor,
    MultiDiffEditorData,
    MultiDiffEditorLabelProvider,
    MultiDiffEditorOpenHandler
} from './multi-diff-editor';
import { MultiDiffEditorResourcePair, MultiDiffEditorUri } from './multi-diff-editor-uri';

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

        it('should clamp setHeight between MIN_ENTRY_HEIGHT and MAX_ENTRY_HEIGHT', () => {
            const { entry } = createEntry();
            try {
                entry.setHeight(50);
                expect(entry.node.style.height).to.equal(`${MIN_ENTRY_HEIGHT}px`);

                entry.setHeight(10_000);
                expect(entry.node.style.height).to.equal(`${MAX_ENTRY_HEIGHT}px`);

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

        it('should track both diff content heights as unchanged regions are hidden or expanded and dispose listeners', () => {
            const originalChanged = new Emitter<void>();
            const modifiedChanged = new Emitter<void>();
            let originalHeight = 300;
            let modifiedHeight = 400;
            const monacoEditor = Object.create(MonacoDiffEditor.prototype);
            Object.defineProperty(monacoEditor, 'diffEditor', {
                value: {
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
                    expect(entry.node.style.height).to.equal(`${MAX_ENTRY_HEIGHT}px`);
                }
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
                expect(editor.focusOnShow).to.be.false;
                expect(editor.detachModelOnHide).to.be.false;
            }
            expect(updateDiffOptions.firstCall.args[0]).to.deep.equal({
                folding: false, codeLens: false, stickyScroll: { enabled: false }, minimap: { enabled: false }, hideUnchangedRegions: { enabled: true }
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
