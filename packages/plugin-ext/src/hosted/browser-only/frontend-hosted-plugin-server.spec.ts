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
// ****************************************************************************

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import { DeployedPlugin, PluginType } from '../../common';
import { FrontendHostedPluginServer, PluginLocalOptions } from './frontend-hosted-plugin-server';

/* eslint-disable @typescript-eslint/no-explicit-any */

function plugin(name: string, version = '1.0.0'): DeployedPlugin {
    return {
        type: PluginType.System,
        metadata: {
            host: 'main',
            model: { publisher: 'theia', name, version } as any,
            lifecycle: {} as any
        }
    } as DeployedPlugin;
}

describe('FrontendHostedPluginServer', () => {

    // `fetchDeployedPlugins` resolves the list URL against `document.baseURI`.
    let disableJSDOM: () => void;
    before(() => { disableJSDOM = enableJSDOM(); });
    after(() => disableJSDOM());

    const originalFetch = globalThis.fetch;
    let requestedUrls: string[];

    function stubFetch(respond: () => Response | Promise<Response>): void {
        requestedUrls = [];
        globalThis.fetch = (async (url: any) => {
            requestedUrls.push(String(url));
            return respond();
        }) as typeof globalThis.fetch;
    }

    function createServer(options?: PluginLocalOptions): FrontendHostedPluginServer {
        const container = new Container();
        container.bind(FrontendHostedPluginServer).toSelf().inSingletonScope();
        if (options) {
            container.bind(PluginLocalOptions).toConstantValue(options);
        }
        return container.get(FrontendHostedPluginServer);
    }

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('serves the plugins listed by the build', async () => {
        stubFetch(() => Response.json([plugin('a'), plugin('b')]));
        const server = createServer();

        expect(await server.getDeployedPluginIds()).to.deep.equal(['theia.a@1.0.0', 'theia.b@1.0.0']);
        expect(requestedUrls).to.deep.equal(['http://localhost/hostedPlugin/list.json']);
    });

    it('fetches the list only once', async () => {
        stubFetch(() => Response.json([plugin('a')]));
        const server = createServer();

        await server.getDeployedPluginIds();
        await server.getDeployedPluginIds();

        expect(requestedUrls).to.have.lengthOf(1);
    });

    it('prefers the metadata supplied by an adopter over the list', async () => {
        stubFetch(() => Response.json([plugin('from-list')]));
        const server = createServer({ pluginMetadata: [plugin('from-options')] });

        expect(await server.getDeployedPluginIds()).to.deep.equal(['theia.from-options@1.0.0']);
        expect(requestedUrls).to.be.empty;
    });

    it('returns only the requested plugins', async () => {
        stubFetch(() => Response.json([plugin('a'), plugin('b'), plugin('c')]));
        const server = createServer();

        const deployed = await server.getDeployedPlugins(['theia.a@1.0.0', 'theia.c@1.0.0']);
        expect(deployed.map(p => p.metadata.model.name)).to.deep.equal(['a', 'c']);
    });

    it('reports where the list could not be loaded from, and retries afterwards', async () => {
        const responses: Array<() => Response> = [
            () => new Response('', { status: 404, statusText: 'Not Found' }),
            () => Response.json([plugin('a')])
        ];
        stubFetch(() => responses.shift()!());
        const server = createServer();

        await server.getDeployedPluginIds().then(
            () => expect.fail('should have rejected'),
            error => expect(error.message).to.contain('http://localhost/hostedPlugin/list.json').and.to.contain('404'));

        expect(await server.getDeployedPluginIds()).to.deep.equal(['theia.a@1.0.0']);
    });

    it('rejects a list that is not an array', async () => {
        stubFetch(() => Response.json({ plugins: [] }));
        const server = createServer();

        await server.getDeployedPluginIds().then(
            () => expect.fail('should have rejected'),
            error => expect(error.message).to.contain('expected an array'));
    });
});
