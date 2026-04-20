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
import { URI } from '@theia/core';
import { LabelProvider } from '@theia/core/lib/browser';
import {
    DiffEntryErrorWidget,
    DiffEntryHeaderWidget,
    DiffEntryLoadingWidget,
    DiffEntryWidget,
    HEADER_HEIGHT,
    MAX_ENTRY_HEIGHT,
    MIN_ENTRY_HEIGHT,
    MultiDiffEditorOpenHandler,
    MultiDiffEditorState
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

    describe('MultiDiffEditorState', () => {

        it('should accept a valid state', () => {
            expect(MultiDiffEditorState.is({ scrollTop: 100, collapsedUris: ['file:///a.ts'] })).to.be.true;
        });

        it('should accept an empty state object', () => {
            expect(MultiDiffEditorState.is({})).to.be.true;
        });

        it('should reject non-object values', () => {
            expect(MultiDiffEditorState.is(undefined)).to.be.false;
            expect(MultiDiffEditorState.is('string')).to.be.false;
            expect(MultiDiffEditorState.is(42)).to.be.false;
        });

        it('should reject wrong scrollTop type', () => {
            expect(MultiDiffEditorState.is({ scrollTop: '100' })).to.be.false;
        });

        it('should reject wrong collapsedUris type', () => {
            expect(MultiDiffEditorState.is({ collapsedUris: 'file:///a.ts' })).to.be.false;
            expect(MultiDiffEditorState.is({ collapsedUris: [1, 2] })).to.be.false;
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
