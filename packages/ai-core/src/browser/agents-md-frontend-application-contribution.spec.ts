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
const disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
try {
    FrontendApplicationConfigProvider.get();
} catch {
    FrontendApplicationConfigProvider.set({});
}

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Emitter, URI } from '@theia/core';
import { AgentsMdFrontendApplicationContribution } from './agents-md-frontend-application-contribution';
import { LEGACY_PROJECT_INFO_PATH } from './agents-md-migration-service';
import { PromptFragmentCustomizationSource } from '../common/prompt-service';

disableJSDOM();

class TestContribution extends AgentsMdFrontendApplicationContribution {
    async checkOverrides(): Promise<void> {
        this.scheduleOverrideWarning();
        await this.settleWarnings();
    }

    async settleWarnings(): Promise<void> {
        await this.startupMigration;
        // Let the debounce timer, which has no delay in these tests, fire.
        await new Promise(resolve => setTimeout(resolve, 0));
        await this.overrideWarningUpdates;
        // Allow the notification action's asynchronous handler to finish.
        await Promise.resolve();
        await Promise.resolve();
    }
}

describe('AgentsMdFrontendApplicationContribution - legacy overrides', () => {
    let sources: PromptFragmentCustomizationSource[];
    let trusted: boolean;
    let roots: { resource: URI }[];
    let stored: number | undefined;
    let choice: string | undefined;
    let contribution: TestContribution;
    let warning: sinon.SinonStub;
    let info: sinon.SinonStub;
    let opener: sinon.SinonStub;
    let writeStorage: sinon.SinonStub;
    let migration: sinon.SinonStub;
    let scanCompleted: Emitter<void>;
    let fragmentsChanged: Emitter<string[]>;
    let trustChanged: Emitter<boolean>;

    function source(path: string, template = 'Instructions', active = true): PromptFragmentCustomizationSource {
        return { uri: URI.fromFilePath(path), template, active };
    }

    function createContribution(): TestContribution {
        const result = new TestContribution();
        Object.assign(result, {
            workspaceTrustService: { getWorkspaceTrust: async () => trusted, onDidChangeWorkspaceTrust: trustChanged.event },
            workspaceService: { ready: Promise.resolve(), tryGetRoots: () => roots },
            customizationService: {
                getPromptFragmentCustomizationSources: () => sources,
                onDidChangeCustomAgents: scanCompleted.event,
                onDidChangePromptFragmentCustomization: fragmentsChanged.event
            },
            storageService: { getData: async () => stored, setData: writeStorage },
            messageService: { warn: warning, info },
            openerService: { getOpener: async () => ({ open: opener }) },
            migrationService: { migrate: migration },
            appStateService: { reachedState: async () => { } },
            logger: { warn: sinon.stub() },
            overrideWarningDelay: 0,
            overrideWarningEnabled: true
        });
        return result;
    }

    beforeEach(() => {
        sources = [];
        trusted = true;
        roots = [{ resource: URI.fromFilePath('/ws') }];
        stored = undefined;
        choice = undefined;
        warning = sinon.stub().callsFake(async () => choice);
        info = sinon.stub().resolves();
        opener = sinon.stub().resolves();
        writeStorage = sinon.stub().callsFake(async (_key: string, value: number) => { stored = value; });
        migration = sinon.stub().resolves([]);
        scanCompleted = new Emitter<void>();
        fragmentsChanged = new Emitter<string[]>();
        trustChanged = new Emitter<boolean>();
        contribution = createContribution();
    });

    afterEach(() => {
        contribution.onStop();
        scanCompleted.dispose();
        fragmentsChanged.dispose();
        trustChanged.dispose();
    });

    it('leaves canonical local files to the automatic migration in every root', async () => {
        roots.push({ resource: URI.fromFilePath('/other') });
        sources = [source(`/ws/${LEGACY_PROJECT_INFO_PATH}`), source(`/other/${LEGACY_PROJECT_INFO_PATH}`)];
        await contribution.checkOverrides();
        expect(warning.called).to.be.false;
    });

    it('lists configured, shared and shadowed sources with their active status', async () => {
        sources = [
            source('/config/project-info.prompttemplate', 'Shared', false),
            source('/ws/.my-prompts/project-info.prompttemplate'),
            source(`/ws/${LEGACY_PROJECT_INFO_PATH}`)
        ];
        await contribution.checkOverrides();
        const message = warning.firstCall.args[0];
        expect(message).to.contain('`/config/project-info.prompttemplate` (Inactive), `/ws/.my-prompts/project-info.prompttemplate` (Active)');
        expect(message).not.to.contain('\n');
        expect(message).not.to.contain(`/ws/${LEGACY_PROJECT_INFO_PATH}`);
        expect(message).to.contain('still apply to prompts that reference project-info');
    });

    it('opens every reported source without treating opening as persistent dismissal', async () => {
        sources = [source('/config/project-info.prompttemplate'), source('/ws/custom/project-info.prompttemplate')];
        choice = 'Open Source Files';
        await contribution.checkOverrides();
        expect(opener.args.map(args => args[0].path.toString())).to.deep.equal(sources.map(entry => entry.uri.path.toString()));
        expect(writeStorage.called).to.be.false;
    });

    it('remembers dismissal across restarts and ignores source ordering', async () => {
        sources = [source('/config/project-info.prompttemplate'), source('/ws/custom/project-info.prompttemplate')];
        await contribution.checkOverrides();
        expect(writeStorage.calledOnce).to.be.true;
        sources.reverse();
        contribution = createContribution();
        await contribution.checkOverrides();
        expect(warning.calledOnce).to.be.true;
    });

    it('warns again when content or source paths change, but not for the active status alone', async () => {
        sources = [source('/config/project-info.prompttemplate')];
        await contribution.checkOverrides();
        sources[0].template = 'Changed instructions';
        await contribution.checkOverrides();
        sources[0].uri = URI.fromFilePath('/config/other/project-info.prompttemplate');
        await contribution.checkOverrides();
        sources[0].active = false;
        await contribution.checkOverrides();
        expect(warning.callCount).to.equal(3);
    });

    it('reports once for a burst of rescans', async () => {
        sources = [source('/config/project-info.prompttemplate')];
        contribution.onStart();
        scanCompleted.fire();
        sources[0].active = false;
        fragmentsChanged.fire(['project-info']);
        scanCompleted.fire();
        await contribution.settleWarnings();
        expect(warning.calledOnce).to.be.true;
        expect(warning.firstCall.args[0]).to.contain('(Inactive)');
    });

    it('does not report anything before the application is ready', async () => {
        sources = [source('/config/project-info.prompttemplate')];
        contribution = createContribution();
        Object.assign(contribution, { overrideWarningEnabled: false, appStateService: { reachedState: () => new Promise(() => { }) } });
        contribution.onStart();
        scanCompleted.fire();
        await contribution.settleWarnings();
        expect(warning.called).to.be.false;
    });

    it('reports leftover prompt syntax in a warning of its own', async () => {
        migration.resolves([{ root: URI.fromFilePath('/ws'), migrated: true, alreadyPresent: false, backedUp: true, containsPromptSyntax: true }]);
        await (contribution as unknown as { runMigration(reportEmptyResult: boolean): Promise<void> }).runMigration(false);
        expect(info.firstCall.args[0]).not.to.contain('prompt template syntax');
        expect(warning.firstCall.args[0]).to.contain('prompt template syntax');
    });

    it('tells the user that an untrusted workspace was not migrated', async () => {
        trusted = false;
        await (contribution as unknown as { runMigration(reportEmptyResult: boolean): Promise<void> }).runMigration(true);
        expect(info.firstCall.args[0]).to.contain('not trusted');
    });

    it('does not show duplicates while a notification is pending', async () => {
        sources = [source('/config/project-info.prompttemplate')];
        warning.returns(new Promise<string | undefined>(() => {}));
        await contribution.checkOverrides();
        await contribution.checkOverrides();
        expect(warning.calledOnce).to.be.true;
    });

    it('does not reuse dismissal in a different workspace', async () => {
        sources = [source('/config/project-info.prompttemplate')];
        await contribution.checkOverrides();
        roots = [{ resource: URI.fromFilePath('/other') }];
        await contribution.checkOverrides();
        expect(warning.calledTwice).to.be.true;
    });

    it('does not warn for an untrusted or empty workspace', async () => {
        sources = [source('/config/project-info.prompttemplate')];
        trusted = false;
        await contribution.checkOverrides();
        trusted = true;
        roots = [];
        await contribution.checkOverrides();
        expect(warning.called).to.be.false;
    });

    it('detects overrides when the initial template scan finishes after migration', async () => {
        contribution.onStart();
        await contribution.settleWarnings();
        expect(migration.calledOnce).to.be.true;
        expect(warning.called).to.be.false;
        sources = [source('/config/project-info.prompttemplate')];
        scanCompleted.fire();
        await contribution.settleWarnings();
        expect(warning.calledOnce).to.be.true;
        sources[0].template = 'Updated';
        fragmentsChanged.fire(['project-info']);
        await contribution.settleWarnings();
        expect(warning.calledTwice).to.be.true;
    });
});
