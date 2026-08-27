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
import { PluginIconTheme } from './plugin-icon-theme-service';

disableJSDOM();

/**
 * Widens `protected` members to `public`/settable so the tests can drive `toPackageRootUri` and
 * `toCSSUrl` without going through `@postConstruct` and the full Inversify container - none of the
 * injected services (`FileService`, `LabelProvider`, etc.) are touched by either method.
 */
class TestablePluginIconTheme extends PluginIconTheme {

    setState(state: { uri: string; pluginId: string; packageUri: string }): void {
        this.uri = state.uri;
        this.pluginId = state.pluginId;
        this.packageUri = state.packageUri;
        this.locationUri = new URI(state.uri).parent;
        this.packageRootUri = this.toPackageRootUri();
    }

    callToPackageRootUri(): URI {
        return this.toPackageRootUri();
    }

    callToCSSUrl(iconPath: string | undefined): string | undefined {
        return this.toCSSUrl(iconPath);
    }
}

describe('PluginIconTheme', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('toPackageRootUri', () => {

        it('rebuilds the root as `hostedPlugin:/<id>/` when the icon theme is addressed via a hostedPlugin URI', () => {
            const theme = new TestablePluginIconTheme();
            theme.setState({
                uri: 'hostedPlugin:/acme_ext/themes/my-icon-theme.json',
                pluginId: 'acme_ext',
                packageUri: 'hostedPlugin/acme_ext/'
            });
            expect(theme.callToPackageRootUri().toString()).to.equal('hostedPlugin:/acme_ext/');
        });

        it('passes the packageUri through unchanged for a backend (file-scheme) icon theme', () => {
            const theme = new TestablePluginIconTheme();
            theme.setState({
                uri: 'file:///plugins/acme.ext-1.0.0/extension/themes/my-icon-theme.json',
                pluginId: 'acme_ext',
                packageUri: 'file:///plugins/acme.ext-1.0.0/extension/'
            });
            expect(theme.callToPackageRootUri().toString()).to.equal('file:///plugins/acme.ext-1.0.0/extension/');
        });

        it('would leave icon paths unresolvable if the hostedPlugin root were derived from packageUri directly', () => {
            // Documents the bug `toPackageRootUri` fixes: `packageUri` for a browser-only plugin is the
            // static `hostedPlugin/<id>/` path (no scheme), which parses as a `file:` URI and can never
            // share a root with the `hostedPlugin:` icon URIs, so `Path#relative` returns `undefined`.
            const naiveRoot = new URI('hostedPlugin/acme_ext/');
            const locationUri = new URI('hostedPlugin:/acme_ext/themes/my-icon-theme.json').parent;
            const iconUri = locationUri.resolve('icons/file.svg');
            expect(naiveRoot.path.relative(iconUri.path.normalize())).to.be.undefined;
        });

    });

    describe('toCSSUrl', () => {

        it('resolves an icon path relative to a hostedPlugin package root into a static plugin asset URL', () => {
            const theme = new TestablePluginIconTheme();
            theme.setState({
                uri: 'hostedPlugin:/acme_ext/themes/my-icon-theme.json',
                pluginId: 'acme_ext',
                packageUri: 'hostedPlugin/acme_ext/'
            });
            expect(theme.callToCSSUrl('icons/file.svg')).to.equal("url('http://localhost/hostedPlugin/acme_ext/themes/icons/file.svg')");
        });

        it('resolves `..` segments in a hostedPlugin icon path back within the plugin root', () => {
            const theme = new TestablePluginIconTheme();
            theme.setState({
                uri: 'hostedPlugin:/acme_ext/themes/my-icon-theme.json',
                pluginId: 'acme_ext',
                packageUri: 'hostedPlugin/acme_ext/'
            });
            expect(theme.callToCSSUrl('../shared/icons/other.svg')).to.equal("url('http://localhost/hostedPlugin/acme_ext/shared/icons/other.svg')");
        });

        it('still resolves icon paths for a backend (file-scheme) icon theme, unaffected by the hostedPlugin fix', () => {
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
                uri: 'hostedPlugin:/acme_ext/themes/my-icon-theme.json',
                pluginId: 'acme_ext',
                packageUri: 'hostedPlugin/acme_ext/'
            });
            expect(theme.callToCSSUrl(undefined)).to.be.undefined;
        });

    });

});
