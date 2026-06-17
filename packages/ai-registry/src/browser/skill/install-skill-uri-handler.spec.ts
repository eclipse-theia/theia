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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
try {
    FrontendApplicationConfigProvider.set({});
} catch {
    // The provider is a global singleton - ignore if a sibling spec has already set it.
}

import { expect } from 'chai';
import { MessageService } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { RegistryFetchService } from '../../common/registry-fetch-service';
import { ResolvedSkillEntry } from '../../common/skill/skill-registry-types';
import { InstallSkillUriConfiguration } from './install-skill-uri-configuration';
import { InstallSkillUriHandler } from './install-skill-uri-handler';
import { SkillInstallService } from './skill-install-service';

disableJSDOM();

const entry: ResolvedSkillEntry = {
    skillId: 'io.github.example/example-skill',
    name: 'Example Skill',
    description: 'An example skill',
    sourceUrl: 'https://github.com/example/skills',
    sourcePath: 'skills/example',
    contentHash: 'hash-v1'
};

interface RecordedMessages {
    info: string[];
    error: string[];
}

function newMessageService(record: RecordedMessages): MessageService {
    return {
        info: (message: string) => { record.info.push(message); return Promise.resolve(undefined); },
        error: (message: string) => { record.error.push(message); return Promise.resolve(undefined); }
    } as unknown as MessageService;
}

const configuration: InstallSkillUriConfiguration = {
    getScheme: () => 'theia',
    getAuthority: () => 'install-skill'
} as InstallSkillUriConfiguration;

/**
 * Test handler that bypasses the real {@link ConfirmDialog} so the handler's branching
 * logic can be exercised without touching the DOM.
 */
class TestInstallSkillUriHandler extends InstallSkillUriHandler {
    confirmResult = true;
    confirmCalls = 0;
    protected override async confirmInstall(_entry: ResolvedSkillEntry): Promise<boolean> {
        this.confirmCalls += 1;
        return this.confirmResult;
    }
}

function createHandler(options: {
    entries?: ResolvedSkillEntry[];
    fetchError?: Error;
    installError?: Error;
}): { handler: TestInstallSkillUriHandler; messages: RecordedMessages; installCalls: ResolvedSkillEntry[] } {
    const installCalls: ResolvedSkillEntry[] = [];
    const fetchService = {
        getSkillEntries: () => options.fetchError ? Promise.reject(options.fetchError) : Promise.resolve(options.entries ?? [])
    } as unknown as RegistryFetchService;
    const installService = {
        install: (e: ResolvedSkillEntry) => {
            installCalls.push(e);
            return options.installError ? Promise.reject(options.installError) : Promise.resolve();
        }
    } as unknown as SkillInstallService;
    const messages: RecordedMessages = { info: [], error: [] };
    const handler = new TestInstallSkillUriHandler();
    Object.assign(handler, {
        configuration,
        fetchService,
        installService,
        messageService: newMessageService(messages)
    });
    return { handler, messages, installCalls };
}

describe('InstallSkillUriHandler', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    it('reports an error and does not install when the id query parameter is missing', async () => {
        const { handler, messages, installCalls } = createHandler({ entries: [entry] });

        await handler.open(new URI('theia://install-skill'));

        expect(messages.error).to.have.lengthOf(1);
        expect(messages.error[0]).to.match(/missing.*id/i);
        expect(messages.info).to.deep.equal([]);
        expect(installCalls).to.deep.equal([]);
        expect(handler.confirmCalls).to.equal(0);
    });

    it('reports an error and does not install when the id is not listed in the registry', async () => {
        const { handler, messages, installCalls } = createHandler({ entries: [entry] });

        await handler.open(new URI('theia://install-skill?id=io.github.example/unknown'));

        expect(messages.error).to.have.lengthOf(1);
        expect(messages.error[0]).to.match(/not listed/i);
        expect(messages.error[0]).to.include('io.github.example/unknown');
        expect(installCalls).to.deep.equal([]);
        expect(handler.confirmCalls).to.equal(0);
    });

    it('reports an error and does not install when the registry fetch fails', async () => {
        const { handler, messages, installCalls } = createHandler({ fetchError: new Error('boom') });

        await handler.open(new URI(`theia://install-skill?id=${entry.skillId}`));

        expect(messages.error).to.have.lengthOf(1);
        expect(messages.error[0]).to.match(/could not load/i);
        expect(installCalls).to.deep.equal([]);
        expect(handler.confirmCalls).to.equal(0);
    });

    it('does not install when the user cancels the confirmation dialog', async () => {
        const { handler, messages, installCalls } = createHandler({ entries: [entry] });
        handler.confirmResult = false;

        await handler.open(new URI(`theia://install-skill?id=${entry.skillId}`));

        expect(handler.confirmCalls).to.equal(1);
        expect(installCalls).to.deep.equal([]);
        expect(messages.info).to.deep.equal([]);
        expect(messages.error).to.deep.equal([]);
    });

    it('reports an error when the install service throws after confirmation', async () => {
        const { handler, messages, installCalls } = createHandler({
            entries: [entry],
            installError: new Error('disk full')
        });

        await handler.open(new URI(`theia://install-skill?id=${entry.skillId}`));

        expect(handler.confirmCalls).to.equal(1);
        expect(installCalls).to.deep.equal([entry]);
        expect(messages.error).to.deep.equal(['disk full']);
        expect(messages.info).to.deep.equal([]);
    });

    it('installs the skill and reports success on the happy path', async () => {
        const { handler, messages, installCalls } = createHandler({ entries: [entry] });

        await handler.open(new URI(`theia://install-skill?id=${entry.skillId}`));

        expect(handler.confirmCalls).to.equal(1);
        expect(installCalls).to.deep.equal([entry]);
        expect(messages.info).to.have.lengthOf(1);
        expect(messages.info[0]).to.include(entry.name);
        expect(messages.error).to.deep.equal([]);
    });
});
