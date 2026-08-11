// *****************************************************************************
// Copyright (C) 2026 JuliaHub, Inc. and others.
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

import { expect } from 'chai';
import { DisposableCollection, Emitter } from '@theia/core/lib/common';
import { PINNED_CLASS, Saveable } from '@theia/core/lib/browser';
import { TabBar, Widget } from '@theia/core/shared/@lumino/widgets';
import { PREVIEW_TITLE_CLASS, PreviewTabHost, PreviewTabSupport } from './preview-tab-widget';

disableJSDOM();

describe('PreviewTabSupport', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    function createHost(overrides?: Partial<PreviewTabHost>): { host: PreviewTabHost, dirtyEmitter: Emitter<void> } {
        const widget = new Widget();
        const dirtyEmitter = new Emitter<void>();
        const saveable: Saveable = {
            dirty: false,
            onDirtyChanged: dirtyEmitter.event,
            onContentChanged: new Emitter<void>().event,
            save: async () => { }
        };
        const host: PreviewTabHost = {
            title: widget.title,
            saveable,
            toDispose: new DisposableCollection(),
            ...overrides
        };
        return { host, dirtyEmitter };
    }

    it('is not a preview until initialized', () => {
        const { host } = createHost();
        expect(new PreviewTabSupport(host).isPreview).false;
    });

    it('adds the italic preview title class on initialize', () => {
        const { host } = createHost();
        const trait = new PreviewTabSupport(host);
        trait.initializePreview();
        expect(trait.isPreview).true;
        expect(host.title.className).contains(PREVIEW_TITLE_CLASS);
    });

    it('promotes to a permanent tab when the content becomes dirty', () => {
        const { host, dirtyEmitter } = createHost();
        const trait = new PreviewTabSupport(host);
        trait.initializePreview();
        dirtyEmitter.fire();
        expect(trait.isPreview).false;
        expect(host.title.className).not.contains(PREVIEW_TITLE_CLASS);
    });

    it('promotes to a permanent tab when the title is pinned', () => {
        const { host } = createHost();
        const trait = new PreviewTabSupport(host);
        trait.initializePreview();
        host.title.className += ` ${PINNED_CLASS}`;
        host.title.label = 'trigger change'; // fires title.changed
        expect(trait.isPreview).false;
    });

    it('fires onDidChangePreviewState once and is idempotent', () => {
        const { host } = createHost();
        const trait = new PreviewTabSupport(host);
        trait.initializePreview();
        let count = 0;
        trait.onDidChangePreviewState(() => count++);
        trait.convertToNonPreview();
        trait.convertToNonPreview();
        expect(count).equal(1);
        expect(trait.isPreview).false;
    });

    it('promotes only when moved between two tab-bars', () => {
        const { host } = createHost();
        const trait = new PreviewTabSupport(host);
        trait.initializePreview();
        const tabBarA = new TabBar<Widget>();
        const tabBarB = new TabBar<Widget>();
        trait.handleTabBarChange(undefined, tabBarA); // first attach: no promotion
        expect(trait.isPreview).true;
        trait.handleTabBarChange(tabBarA, tabBarB); // moved: promote
        expect(trait.isPreview).false;
    });

    it('invokes onConvertToNonPreview on promotion', () => {
        let called = false;
        const { host } = createHost({ onConvertToNonPreview: () => { called = true; } });
        const trait = new PreviewTabSupport(host);
        trait.initializePreview();
        trait.convertToNonPreview();
        expect(called).true;
    });
});
