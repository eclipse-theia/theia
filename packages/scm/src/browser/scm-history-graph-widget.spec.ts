// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { ContextKey, ContextKeyServiceDummyImpl, ContextKeyValue } from '@theia/core/lib/browser/context-key-service';
import { ScmContextKeyService } from './scm-context-key-service';
import { ScmHistoryGraphWidget } from './scm-history-graph-widget';
import { ScmHistoryProvider } from './scm-provider';

disableJSDOM();

class MockContextKeyService extends ContextKeyServiceDummyImpl {
    override createKey<T extends ContextKeyValue>(key: string, defaultValue: T | undefined): ContextKey<T> {
        let value: T | undefined = defaultValue;
        return {
            set: (v: T | undefined) => { value = v; },
            reset: () => { value = defaultValue; },
            get: () => value
        };
    }
}

function createScmContextKeyService(): ScmContextKeyService {
    const service = new ScmContextKeyService();
    (service as unknown as { contextKeyService: MockContextKeyService }).contextKeyService = new MockContextKeyService();
    (service as unknown as { init(): void }).init();
    return service;
}

describe('ScmHistoryGraphWidget context keys', () => {
    let restoreJSDOM: () => void;
    let widget: ScmHistoryGraphWidget;
    let scmContextKeys: ScmContextKeyService;
    let provider: Partial<ScmHistoryProvider> | undefined;

    beforeEach(() => {
        restoreJSDOM = enableJSDOM();
        scmContextKeys = createScmContextKeyService();
        widget = new ScmHistoryGraphWidget();
        const raw = widget as unknown as Record<string, unknown>;
        raw.scmContextKeys = scmContextKeys;
        Object.defineProperty(raw, 'model', {
            get: () => ({ provider })
        });
    });

    afterEach(() => {
        restoreJSDOM();
    });

    function updateContextKeys(): void {
        (widget as unknown as { updateContextKeys(): void }).updateContextKeys();
    }

    it('should set scmCurrentHistoryItemRefInFilter when the provider has a current ref', () => {
        provider = {
            currentHistoryItemRef: { id: 'refs/heads/main', name: 'main' }
        };
        updateContextKeys();
        expect(scmContextKeys.scmCurrentHistoryItemRefInFilter.get()).to.equal(true);
    });

    it('should clear scmCurrentHistoryItemRefInFilter when the provider has no current ref', () => {
        scmContextKeys.scmCurrentHistoryItemRefInFilter.set(true);
        provider = {};
        updateContextKeys();
        expect(scmContextKeys.scmCurrentHistoryItemRefInFilter.get()).to.equal(false);
    });

    it('should clear scmCurrentHistoryItemRefInFilter when there is no provider', () => {
        scmContextKeys.scmCurrentHistoryItemRefInFilter.set(true);
        provider = undefined;
        updateContextKeys();
        expect(scmContextKeys.scmCurrentHistoryItemRefInFilter.get()).to.equal(false);
    });

    it('should set scmCurrentHistoryItemRefHasRemote when the provider has a remote ref', () => {
        provider = {
            currentHistoryItemRef: { id: 'refs/heads/main', name: 'main' },
            currentHistoryItemRemoteRef: { id: 'refs/remotes/origin/main', name: 'origin/main' }
        };
        updateContextKeys();
        expect(scmContextKeys.scmCurrentHistoryItemRefHasRemote.get()).to.equal(true);
    });
});
