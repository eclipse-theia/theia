// *****************************************************************************
// Copyright (C) 2026 Robert Jandow
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
// `PluginContributionHandler` transitively imports monaco, terminal and workspace modules that
// touch `document` at load time.
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
// `WorkspaceService`, imported transitively, reads the frontend application config at module load time.
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { PLUGINS_SCHEME } from '@theia/plugin-utils/lib/common/constants';
import { DeployedPlugin, GrammarsContribution } from '../../common';
import { PluginContributionHandler } from './plugin-contribution-handler';

disableJSDOM();

/** Grammar loading only needs `fileService`, so there's no container. */
class TestablePluginContributionHandler extends PluginContributionHandler {

    readonly reads: string[] = [];

    constructor() {
        super();
        (this as unknown as { fileService: Partial<FileService> }).fileService = {
            read: async (uri: URI) => {
                this.reads.push(uri.toString());
                return { value: `content of ${uri.path.base}` } as Awaited<ReturnType<FileService['read']>>;
            }
        };
    }

    loader(grammar: GrammarsContribution): () => Promise<string | object> {
        return this.createGrammarContentLoader(plugin, grammar);
    }
}

const plugin = {
    metadata: { model: { packageUri: `${PLUGINS_SCHEME}:/acme_ext/` } }
} as DeployedPlugin;

describe('PluginContributionHandler', () => {

    describe('createGrammarContentLoader', () => {

        let handler: TestablePluginContributionHandler;

        beforeEach(() => {
            handler = new TestablePluginContributionHandler();
        });

        it('returns inlined content without reading the plugin files', async () => {
            const content = { scopeName: 'source.acme' };
            const load = handler.loader({ scope: 'source.acme', format: 'json', grammar: content, grammarLocation: './syntaxes/acme.json' });

            expect(await load()).to.equal(content);
            expect(handler.reads).to.be.empty;
        });

        it('reads the grammar relative to the plugin root', async () => {
            const load = handler.loader({ scope: 'source.acme', format: 'json', grammarLocation: './syntaxes/acme.tmLanguage.json' });

            expect(await load()).to.equal('content of acme.tmLanguage.json');
            expect(handler.reads).to.deep.equal([`${PLUGINS_SCHEME}:/acme_ext/syntaxes/acme.tmLanguage.json`]);
        });

        it('fails if the grammar has neither content nor location', async () => {
            const load = handler.loader({ scope: 'source.acme', format: 'json' });

            await load().then(() => expect.fail('expected the load to fail'), error => expect(String(error)).to.contain('source.acme'));
            expect(handler.reads).to.be.empty;
        });
    });
});
