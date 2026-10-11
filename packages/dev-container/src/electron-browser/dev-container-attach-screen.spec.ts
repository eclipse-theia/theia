// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { DevContainerAttachScreen } from './dev-container-attach-screen';

disableJSDOM();

describe('DevContainerAttachScreen.resolveSplashUrl', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    // The frontend HTML lives at `<appRoot>/lib/frontend/index.html`; splash content is resolved
    // from `<appRoot>`, i.e. two levels up.
    const base = 'file:///app/lib/frontend/index.html?port=3000#!empty';

    it('resolves the splash content relative to the application root', () => {
        expect(DevContainerAttachScreen.resolveSplashUrl('resources/theia-logo.svg', base))
            .to.equal('file:///app/resources/theia-logo.svg');
    });

    it('uses an absolute path as-is, without the "../../" prefix', () => {
        expect(DevContainerAttachScreen.resolveSplashUrl('/opt/app/logo.svg', base))
            .to.equal('file:///opt/app/logo.svg');
    });

    it('uses an already-absolute URL as-is', () => {
        expect(DevContainerAttachScreen.resolveSplashUrl('https://example.com/logo.svg', base))
            .to.equal('https://example.com/logo.svg');
        expect(DevContainerAttachScreen.resolveSplashUrl('data:image/svg+xml,<svg/>', base))
            .to.equal('data:image/svg+xml,<svg/>');
    });

    it('returns undefined when no splash content is configured', () => {
        expect(DevContainerAttachScreen.resolveSplashUrl(undefined, base)).to.be.undefined;
        expect(DevContainerAttachScreen.resolveSplashUrl('', base)).to.be.undefined;
    });

    it('returns undefined when the base href is not a valid URL', () => {
        expect(DevContainerAttachScreen.resolveSplashUrl('resources/logo.svg', 'not a url')).to.be.undefined;
    });
});
