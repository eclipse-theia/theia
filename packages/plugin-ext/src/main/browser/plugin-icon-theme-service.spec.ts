// *****************************************************************************
// Copyright (C) 2026 robertjndw
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
// `PluginIconTheme` transitively imports monaco/filesystem/workspace modules that touch `document`
// at load time, and `toCSSUrl` needs `self.location` (via `Endpoint`) at call time, so JSDOM is
// re-enabled for the test run below.
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
// `WorkspaceService`, transitively imported for `PluginIconTheme`'s `@inject` property, reads the
// frontend application config at module load time.
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { PLUGINS_SCHEME } from '@theia/plugin-utils/lib/common/constants';
import { PluginIconTheme } from './plugin-icon-theme-service';

disableJSDOM();

/**
 * Widens `protected` members to `public`/settable so the tests can drive `toCSSUrl` without going
 * through `@postConstruct` and the full Inversify container - none of the injected services
 * (`FileService`, `LabelProvider`, etc.) are touched by it.
 */
class TestablePluginIconTheme extends PluginIconTheme {

    setState(state: { uri: string; pluginId: string; packageUri: string }): void {
        this.uri = state.uri;
        this.pluginId = state.pluginId;
        this.packageUri = state.packageUri;
        this.locationUri = new URI(state.uri).parent;
        this.packageRootUri = new URI(state.packageUri);
    }

    callToCSSUrl(iconPath: string | undefined): string | undefined {
        return this.toCSSUrl(iconPath);
    }
}

describe('PluginIconTheme', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('toCSSUrl', () => {

        it('resolves an icon path relative to a browser-only plugin package root into a static plugin asset URL', () => {
            const theme = new TestablePluginIconTheme();
            theme.setState({
                uri: `${PLUGINS_SCHEME}:/acme_ext/themes/my-icon-theme.json`,
                pluginId: 'acme_ext',
                packageUri: `${PLUGINS_SCHEME}:/acme_ext/`
            });
            expect(theme.callToCSSUrl('icons/file.svg')).to.equal("url('http://localhost/hostedPlugin/acme_ext/themes/icons/file.svg')");
        });

        it('resolves `..` segments in a browser-only icon path back within the plugin root', () => {
            const theme = new TestablePluginIconTheme();
            theme.setState({
                uri: `${PLUGINS_SCHEME}:/acme_ext/themes/my-icon-theme.json`,
                pluginId: 'acme_ext',
                packageUri: `${PLUGINS_SCHEME}:/acme_ext/`
            });
            expect(theme.callToCSSUrl('../shared/icons/other.svg')).to.equal("url('http://localhost/hostedPlugin/acme_ext/shared/icons/other.svg')");
        });

        it('still resolves icon paths for a backend (file-scheme) icon theme', () => {
            const theme = new TestablePluginIconTheme();
            theme.setState({
                uri: 'file:///plugins/acme.ext-1.0.0/extension/themes/my-icon-theme.json',
                pluginId: 'acme_ext',
                packageUri: 'file:///plugins/acme.ext-1.0.0/extension/'
            });
            expect(theme.callToCSSUrl('icons/file.svg')).to.equal("url('http://localhost/hostedPlugin/acme_ext/themes/icons/file.svg')");
        });

        it('returns undefined for an empty icon path', () => {
            const theme = new TestablePluginIconTheme();
            theme.setState({
                uri: `${PLUGINS_SCHEME}:/acme_ext/themes/my-icon-theme.json`,
                pluginId: 'acme_ext',
                packageUri: `${PLUGINS_SCHEME}:/acme_ext/`
            });
            expect(theme.callToCSSUrl(undefined)).to.be.undefined;
        });

    });

});
