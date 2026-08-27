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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();
// xterm.js (pulled in transitively via plugin-ext from VSXExtensionsModel) calls
// HTMLCanvasElement.prototype.getContext at module-load time. JSDOM's default impl
// throws 'Not implemented' without the optional `canvas` package; replace it with a
// no-op so the module graph evaluates. The tests below never render xterm itself.
const canvasProto = (globalThis as { HTMLCanvasElement?: { prototype: { getContext?: unknown } } }).HTMLCanvasElement?.prototype;
if (canvasProto) {
    canvasProto.getContext = () => undefined;
}
try { FrontendApplicationConfigProvider.set({}); } catch { /* already set by a sibling spec */ }

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { CommandRegistry } from '@theia/core/lib/common';
import { ContextMenuRenderer, HoverService } from '@theia/core/lib/browser';
import { OpenerService } from '@theia/core/lib/browser/opener-service';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { HostedPluginSupport } from '@theia/plugin-ext/lib/hosted/browser/hosted-plugin';
import { PluginServer } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';
import { ProgressService } from '@theia/core/lib/common/progress-service';
import { VSXEnvironment } from '../common/vsx-environment';
import { VSXExtensionsSearchModel } from './vsx-extensions-search-model';
import { VSXExtensionsModel } from './vsx-extensions-model';
import { VSXExtension, VSXExtensionFactory, VSXExtensionOptions } from './vsx-extension';

after(() => disableJSDOM());

describe('VSXExtension', () => {

    /** Counts calls made to `VSXEnvironment.getRegistryUri` so eager and repeated resolution can be detected. */
    let getRegistryUriCallCount: number;

    let extensionFactory: VSXExtensionFactory;

    beforeEach(() => {
        getRegistryUriCallCount = 0;

        const inert = <T>(): T => ({} as unknown as T);

        const container = new Container();
        container.bind(VSXExtension).toSelf();
        container.bind(VSXExtensionFactory).toFactory(ctx => (options: VSXExtensionOptions) => {
            const child = ctx.container.createChild();
            child.bind(VSXExtensionOptions).toConstantValue(options);
            return child.get(VSXExtension);
        });

        container.bind(VSXEnvironment).toConstantValue({
            getRegistryUri: () => {
                getRegistryUriCallCount++;
                return Promise.resolve('https://open-vsx.org');
            }
        } as unknown as VSXEnvironment);

        container.bind(OpenerService).toConstantValue(inert());
        // `getRegistryLink()` reads `this.downloadUrl`, which looks up the deployed plugin - give
        // it a real (empty) answer rather than an inert stub that would throw when called.
        container.bind(HostedPluginSupport).toConstantValue({ getPlugin: () => undefined } as unknown as HostedPluginSupport);
        container.bind(PluginServer).toConstantValue(inert());
        container.bind(ProgressService).toConstantValue(inert());
        container.bind(ContextMenuRenderer).toConstantValue(inert());
        container.bind(VSXExtensionsSearchModel).toConstantValue(inert());
        container.bind(HoverService).toConstantValue(inert());
        container.bind(WindowService).toConstantValue(inert());
        container.bind(CommandRegistry).toConstantValue(inert());
        container.bind(WorkspaceTrustService).toConstantValue(inert());

        extensionFactory = container.get(VSXExtensionFactory);
    });

    it('never asks for the registry uri while constructing extensions', () => {
        // Regression test: `postConstruct()` used to eagerly call `getRegistryUri()` for every
        // extension, firing one request per row in the list at startup (85 known-to-fail calls
        // in browser-only mode, where there is no backend to answer them).
        for (let i = 0; i < 85; i++) {
            extensionFactory({ id: `test.extension-${i}`, model: {} as unknown as VSXExtensionsModel });
        }

        expect(getRegistryUriCallCount).to.equal(0);
    });

    it('resolves the registry uri lazily and memoizes it', async () => {
        const extension = extensionFactory({ id: 'test.extension', model: {} as unknown as VSXExtensionsModel });
        expect(getRegistryUriCallCount).to.equal(0);

        await extension.getRegistryLink();
        expect(getRegistryUriCallCount).to.equal(1);

        await extension.getRegistryLink();
        expect(getRegistryUriCallCount).to.equal(1);
    });
});
