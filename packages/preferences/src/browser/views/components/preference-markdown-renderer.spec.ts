// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

/* eslint-disable no-unsanitized/property */

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import * as DOMPurify from '@theia/core/shared/dompurify';
import { PreferenceMarkdownRenderer } from './preference-markdown-renderer';

disableJSDOM();

describe('preference-markdown-renderer', () => {

    let renderer: PreferenceMarkdownRenderer;

    before(() => {
        disableJSDOM = enableJSDOM();
        renderer = new PreferenceMarkdownRenderer();
    });

    after(() => {
        disableJSDOM();
    });

    /**
     * Renders a markdown description the way the preference node renderer displays it.
     */
    function renderDescription(markdown: string): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = DOMPurify.sanitize(renderer.render(markdown), { ALLOW_UNKNOWN_PROTOCOLS: true });
        return wrapper;
    }

    it('keeps a command link of a description intact', () => {
        const link = renderDescription('[Do something](command:my.extension.doSomething)').querySelector('a');

        expect(link?.textContent).eq('Do something');
        const uri = new URI(link!.getAttribute('href')!);
        expect(uri.scheme).eq('command');
        expect(uri.path.toString()).eq('my.extension.doSomething');
    });

    it('drops a scripting link of a description', () => {
        // eslint-disable-next-line no-script-url
        const wrapper = renderDescription('[Do something](javascript:alert(1))');

        expect(wrapper.querySelector('a[href]')).to.not.exist;
    });
});
