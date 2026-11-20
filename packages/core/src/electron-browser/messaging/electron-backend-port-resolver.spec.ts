// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { expect } from 'chai';
import { enableJSDOM } from '../../browser/test/jsdom.js';
import { ElectronBackendPortResolverImpl } from './electron-backend-port-resolver.js';

class TestResolver extends ElectronBackendPortResolverImpl {
    requests = 0;

    protected override async getBackendPort(): Promise<number> {
        this.requests++;
        return 4242;
    }
}

describe('ElectronBackendPortResolverImpl', () => {

    let disableJSDOM: () => void;
    let resolver: TestResolver;

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => resolver = new TestResolver());

    function load(search: string): void {
        history.replaceState(undefined, '', `/index.html${search}#/workspace`);
    }

    it('keeps the port that the URL carries', async () => {
        load('?port=3030');
        await resolver.resolve();
        expect(resolver.requests).to.equal(0);
        expect(location.search).to.equal('?port=3030');
    });

    it('replaces an empty port', async () => {
        load('?port=&other=value');
        await resolver.resolve();
        expect(resolver.requests).to.equal(1);
        expect(new URLSearchParams(location.search).get('port')).to.equal('4242');
        expect(new URLSearchParams(location.search).get('other')).to.equal('value');
    });

    it('writes a missing port into the URL', async () => {
        load('');
        await resolver.resolve();
        expect(resolver.requests).to.equal(1);
        expect(location.search).to.equal('?port=4242');
        expect(location.pathname).to.equal('/index.html');
        expect(location.hash).to.equal('#/workspace');
    });
});
