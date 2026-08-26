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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
// Needed for the imports below; torn down again straight away, because another spec in this package
// disables JSDOM at import time and these tests re-acquire it in `before` instead.
let disableJSDOM = enableJSDOM();
try {
    FrontendApplicationConfigProvider.get();
} catch {
    FrontendApplicationConfigProvider.set({});
}

import { expect } from 'chai';
import { ContextMenuRenderer, HoverRequest, HoverService } from '@theia/core/lib/browser';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { flushSync } from '@theia/core/shared/react-dom';
import { InstalledPluginInfo, PluginClassificationResult } from '../../common/plugin/plugin-registry-types';
import { PluginEntryHandlers, PluginInstalledEntry } from './plugin-entries';

disableJSDOM();

const DIRECTORY_NAME = 'io.github.acme_tools';

const handlers: PluginEntryHandlers = {
    install: async () => undefined,
    update: async () => undefined,
    fixPlugin: async () => undefined,
    link: async () => undefined,
    unlink: async () => undefined,
    uninstall: async () => undefined
};

/** Stands in for the core renderer; the markdown body is not what these tests are about. */
const markdownRenderer: MarkdownRenderer = {
    render: (markdown: MarkdownString | undefined) => {
        const element = document.createElement('div');
        element.textContent = markdown?.value ?? '';
        return { element, dispose: () => { } };
    }
};

function installed(overrides: Partial<InstalledPluginInfo> = {}): InstalledPluginInfo {
    return {
        directoryName: DIRECTORY_NAME,
        root: `/home/u/.agents/plugins/${DIRECTORY_NAME}`,
        dataRoot: `/home/u/.agents/plugin-data/${DIRECTORY_NAME}`,
        pluginId: 'io.github.acme/tools',
        contentHash: 'hash-v1',
        qualifier: 'tools',
        drifted: false,
        name: 'Acme Tools',
        skills: ['deploy'],
        servers: [],
        skipped: [],
        ...overrides
    };
}

describe('PluginInstalledEntry auto-update context', () => {

    function entryFor(state: PluginClassificationResult, info = installed()): PluginInstalledEntry {
        return new PluginInstalledEntry(info, undefined, state, handlers, hoverService, markdownRenderer, contextMenuRenderer);
    }

    const hoverService = {} as unknown as HoverService;
    const contextMenuRenderer = {} as unknown as ContextMenuRenderer;

    it('offers a policy for a drifted plugin, which shows a warning and has to be fixed first', () => {
        expect(entryFor({ kind: 'fix-plugin' }, installed({ drifted: true })).autoUpdateId).to.equal('io.github.acme/tools');
    });

    it('keeps the policy of a plugin whose registry entry has gone missing, using the recorded identifier', () => {
        // `matchedEntry` is undefined by definition here, so this only works via the local marker.
        expect(entryFor({ kind: 'installed-link-stale' }).autoUpdateId).to.equal('io.github.acme/tools');
    });

    it('offers no policy for a directory the registry has never known', () => {
        expect(entryFor({ kind: 'installed-user-added' }, installed({ pluginId: undefined })).autoUpdateId).to.be.undefined;
    });
});

describe('PluginInstalledEntry hover', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    let host: HTMLElement;
    let root: Root | undefined;
    let requested: HoverRequest | undefined;

    const hoverService = {
        requestHover: (request: HoverRequest) => { requested = request; },
        cancelHover: () => { }
    } as unknown as HoverService;

    const contextMenuRenderer = { render: () => { } } as unknown as ContextMenuRenderer;

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        requested = undefined;
    });

    afterEach(() => {
        root?.unmount();
        root = undefined;
        host.remove();
    });

    /** Renders the entry and hovers the card, which is when the tooltip content is handed over. */
    function hover(info: InstalledPluginInfo): HoverRequest['content'] {
        const entry = new PluginInstalledEntry(info, undefined, { kind: 'installed-from-registry', updateAvailable: false },
            handlers, hoverService, markdownRenderer, contextMenuRenderer);
        root ??= createRoot(host);
        flushSync(() => root!.render(<div>{entry.render()}</div>));
        const card = host.querySelector('.theia-vsx-extension') as HTMLElement;
        card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        return requested!.content;
    }

    it('hands over markdown for a plugin that loaded cleanly', () => {
        const content = hover(installed());

        expect(content).to.not.be.instanceOf(HTMLElement);
        expect((content as MarkdownString).value).to.contain('Acme Tools');
        // Names, so the hover says what the plugin actually brings rather than how many of each.
        expect((content as MarkdownString).value).to.contain('deploy');
    });

    it('renders the reasons a component was skipped in the warning colour, not as more description', () => {
        const content = hover(installed({ skipped: [{ name: 'broken', reason: 'The server configuration is not a JSON object.' }] }));

        expect(content).to.be.instanceOf(HTMLElement);
        const warning = (content as HTMLElement).querySelector('.theia-agent-plugin-hover-warning');
        expect(warning?.textContent).to.contain('The server configuration is not a JSON object.');
    });

    it('reports a rejected mcp.json in the same warning run', () => {
        const content = hover(installed({ mcpDisabledReason: '"mcp.json" is not valid JSON.' }));

        const warning = (content as HTMLElement).querySelector('.theia-agent-plugin-hover-warning');
        expect(warning?.textContent).to.contain('"mcp.json" is not valid JSON.');
    });
});
