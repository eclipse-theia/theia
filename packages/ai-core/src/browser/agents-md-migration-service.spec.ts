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
// Guarded: another spec in the same mocha process may already have set it, and `set` throws on a
// second call.
try {
    FrontendApplicationConfigProvider.get();
} catch {
    FrontendApplicationConfigProvider.set({});
}

import { expect } from 'chai';
import * as sinon from 'sinon';
import { ILogger, Logger, URI } from '@theia/core';
import { PreferenceScope } from '@theia/core/lib/common/preferences';
import { AISettings } from '../common';
import { AISettingsServiceImpl } from './ai-settings-service';
import { AgentsMdMigrationService, LEGACY_PROJECT_INFO_PATH } from './agents-md-migration-service';

disableJSDOM();

describe('AgentsMdMigrationService', () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let fileServiceMock: any;
    let workspaceServiceMock: any;
    let trustServiceMock: any;
    let configurationServiceMock: any;
    /** User-scope `ai-features.agentSettings`. */
    let settings: AISettings;
    /** Workspace-scope `ai-features.agentSettings`, i.e. what `.theia/settings.json` holds. */
    let workspaceScopedSettings: AISettings | undefined;
    let trusted: boolean;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const legacyPath = `/ws/${LEGACY_PROJECT_INFO_PATH}`;

    /** What a trust-aware, scope-merging read returns: workspace scope wins, and is hidden while untrusted. */
    function effectiveSettings(): AISettings {
        return { ...settings, ...(trusted ? workspaceScopedSettings : undefined) };
    }

    function createService(): AgentsMdMigrationService {
        const service = new AgentsMdMigrationService();
        (service as unknown as { fileService: unknown }).fileService = fileServiceMock;
        (service as unknown as { workspaceService: unknown }).workspaceService = workspaceServiceMock;
        (service as unknown as { workspaceTrustService: unknown }).workspaceTrustService = trustServiceMock;
        (service as unknown as { aiConfigurationService: unknown }).aiConfigurationService = configurationServiceMock;
        const loggerMock: ILogger = sinon.createStubInstance(Logger);
        (service as unknown as { logger: unknown }).logger = loggerMock;
        return service;
    }

    function existing(...paths: string[]): void {
        fileServiceMock.exists.callsFake((uri: URI) => Promise.resolve(paths.includes(uri.path.toString())));
    }

    function createdContent(): string {
        return fileServiceMock.createFile.firstCall.args[1].toString();
    }

    beforeEach(() => {
        settings = {};
        workspaceScopedSettings = undefined;
        fileServiceMock = {
            exists: sinon.stub().resolves(false),
            read: sinon.stub().resolves({ value: 'project conventions' }),
            createFile: sinon.stub().resolves(undefined),
            move: sinon.stub().resolves(undefined)
        };
        workspaceServiceMock = {
            tryGetRoots: sinon.stub().returns([{ resource: new URI('file:///ws'), name: 'ws' }])
        };
        trusted = true;
        trustServiceMock = { getWorkspaceTrust: sinon.stub().callsFake(() => Promise.resolve(trusted)) };
        // Models the two properties that make the real service dangerous to call carelessly: reads
        // are merged across scopes and suppress workspace scope while untrusted, and `update` writes
        // to the narrowest scope the key is already defined in. A flat store cannot express either,
        // which is why an earlier version of this suite could not fail on a scope mix-up.
        configurationServiceMock = {
            ready: Promise.resolve(),
            get: sinon.stub().callsFake(() => effectiveSettings()),
            inspect: sinon.stub().callsFake(() => ({
                globalValue: settings,
                workspaceValue: trusted ? workspaceScopedSettings : undefined,
                value: effectiveSettings()
            })),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            update: sinon.stub().callsFake((_name: string, value: any) => {
                if (workspaceScopedSettings) {
                    workspaceScopedSettings = value;
                } else {
                    settings = value;
                }
                return Promise.resolve();
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            set: sinon.stub().callsFake((_name: string, value: any, scope: PreferenceScope) => {
                if (scope === PreferenceScope.Workspace) {
                    workspaceScopedSettings = value;
                } else {
                    settings = value;
                }
                return Promise.resolve();
            })
        };
    });

    afterEach(() => sinon.restore());

    describe('file migration', () => {
        it('reports nothing when there is no legacy file', async () => {
            expect(await createService().migrate()).to.be.empty;
            expect(fileServiceMock.createFile.called).to.be.false;
        });

        it('writes AGENTS.md from the legacy file and backs the legacy file up', async () => {
            existing(legacyPath);
            const reports = await createService().migrate();

            expect(reports).to.have.lengthOf(1);
            expect(reports[0].migrated).to.be.true;
            expect(reports[0].backedUp).to.be.true;
            expect(fileServiceMock.createFile.firstCall.args[0].path.toString()).to.equal('/ws/AGENTS.md');
            expect(createdContent()).to.equal('project conventions');
            expect(fileServiceMock.move.firstCall.args[1].path.toString()).to.equal(`${legacyPath}.bak`);
        });

        it('never overwrites an existing AGENTS.md, but still retires the legacy file', async () => {
            existing(legacyPath, '/ws/AGENTS.md');
            const reports = await createService().migrate();

            expect(reports[0].migrated).to.be.false;
            expect(reports[0].alreadyPresent).to.be.true;
            expect(reports[0].backedUp).to.be.true;
            expect(fileServiceMock.createFile.called).to.be.false;
        });

        it('is idempotent: a second run finds nothing once the legacy file is gone', async () => {
            existing(legacyPath);
            const service = createService();
            await service.migrate();

            existing('/ws/AGENTS.md', `${legacyPath}.bak`);
            expect(await service.migrate()).to.be.empty;
        });

        it('flags prompt template syntax that AGENTS.md no longer resolves', async () => {
            existing(legacyPath);
            fileServiceMock.read.resolves({ value: 'Read files with ~{getFileContent} and see {{contextFiles}}.' });

            const reports = await createService().migrate();

            expect(reports[0].containsPromptSyntax).to.be.true;
            // The content is still carried over verbatim; nothing is silently stripped.
            expect(createdContent()).to.equal('Read files with ~{getFileContent} and see {{contextFiles}}.');
        });

        it('does not flag plain content', async () => {
            existing(legacyPath);
            const reports = await createService().migrate();

            expect(reports[0].containsPromptSyntax).to.be.false;
        });

        it('reports the failure and leaves the legacy file alone when the write fails', async () => {
            existing(legacyPath);
            fileServiceMock.createFile.rejects(new Error('read-only'));

            const reports = await createService().migrate();

            expect(reports[0].error).to.contain('read-only');
            expect(reports[0].migrated).to.be.false;
            expect(fileServiceMock.move.called).to.be.false;
        });

        it('migrates every workspace root that has a legacy file', async () => {
            workspaceServiceMock.tryGetRoots.returns([
                { resource: new URI('file:///a'), name: 'a' },
                { resource: new URI('file:///b'), name: 'b' }
            ]);
            existing(`/a/${LEGACY_PROJECT_INFO_PATH}`, `/b/${LEGACY_PROJECT_INFO_PATH}`);

            const reports = await createService().migrate();

            expect(reports.map(report => report.migrated)).to.deep.equal([true, true]);
        });

        it('coalesces concurrent calls into a single migration', async () => {
            // Startup and the initial workspace-trust resolution both trigger a migration. Without
            // coalescing both reach `createFile`, and the loser throws because the write passes no
            // `overwrite`, producing a phantom failure for a migration that in fact succeeded.
            existing(legacyPath);
            const service = createService();

            const [first, second] = await Promise.all([service.migrate(), service.migrate()]);

            expect(fileServiceMock.createFile.callCount).to.equal(1);
            expect(fileServiceMock.move.callCount).to.equal(1);
            expect(second).to.equal(first);
            expect(first[0].error).to.be.undefined;
        });

        it('starts a fresh migration once the previous one has settled', async () => {
            existing(legacyPath);
            const service = createService();
            await service.migrate();

            await service.migrate();

            expect(fileServiceMock.createFile.callCount).to.equal(2);
        });

        it('reports the backup as not done when the rename fails', async () => {
            existing(legacyPath);
            fileServiceMock.move.rejects(new Error('read-only'));

            const reports = await createService().migrate();

            expect(reports[0].migrated).to.be.true;
            expect(reports[0].backedUp).to.be.false;
        });

        it('writes nothing into an untrusted workspace', async () => {
            existing(legacyPath);
            trustServiceMock.getWorkspaceTrust.resolves(false);

            expect(await createService().migrate()).to.be.empty;
            expect(fileServiceMock.createFile.called).to.be.false;
            expect(fileServiceMock.move.called).to.be.false;
        });
    });

    describe('agent settings migration', () => {
        it('carries the settings over to the new agent id', async () => {
            settings = { ProjectInfo: { enable: true, languageModelRequirements: [{ purpose: 'chat', identifier: 'my/model' }] } };

            await createService().migrate();

            expect(settings.ProjectInfo).to.be.undefined;
            expect(settings.AgentsMd).to.deep.equal({ enable: true, languageModelRequirements: [{ purpose: 'chat', identifier: 'my/model' }] });
        });

        it('renames the prompt ids in selectedVariants', async () => {
            settings = { ProjectInfo: { selectedVariants: { 'project-info-system': 'my-variant', 'other-prompt': 'keep' } } };

            await createService().migrate();

            expect(settings.AgentsMd.selectedVariants).to.deep.equal({ 'agents-md-system': 'my-variant', 'other-prompt': 'keep' });
        });

        it('leaves other agents untouched', async () => {
            settings = { ProjectInfo: { enable: false }, Coder: { enable: true } };

            await createService().migrate();

            expect(settings.Coder).to.deep.equal({ enable: true });
        });

        it('does nothing when the new id is already configured', async () => {
            settings = { ProjectInfo: { enable: false }, AgentsMd: { enable: true } };

            await createService().migrate();

            expect(configurationServiceMock.set.called).to.be.false;
        });

        it('does nothing when there are no legacy settings', async () => {
            await createService().migrate();

            expect(configurationServiceMock.set.called).to.be.false;
        });

        it('runs untrusted, and addresses user scope on both the read and the write', async () => {
            settings = { ProjectInfo: { enable: true } };
            trusted = false;

            await createService().migrate();

            expect(settings.AgentsMd).to.deep.equal({ enable: true });
            expect(configurationServiceMock.set.firstCall.args[0]).to.equal(AISettingsServiceImpl.PREFERENCE_NAME);
            expect(configurationServiceMock.set.firstCall.args[2]).to.equal(PreferenceScope.User);
        });

        it('never rewrites workspace-scoped settings from a user-scope read while untrusted', async () => {
            // The scenario the scope mix-up destroyed: a shared `.theia/settings.json` holding other
            // agents, invisible to the read because the workspace is untrusted.
            settings = { ProjectInfo: { enable: true } };
            workspaceScopedSettings = { Coder: { enable: true }, Universal: { enable: false } };
            trusted = false;

            await createService().migrate();

            expect(workspaceScopedSettings).to.deep.equal({ Coder: { enable: true }, Universal: { enable: false } });
            expect(settings.AgentsMd).to.deep.equal({ enable: true });
            expect(settings.ProjectInfo).to.be.undefined;
        });

        it('leaves a workspace-scoped entry alone rather than promoting it into user scope', async () => {
            workspaceScopedSettings = { Coder: { enable: true } };
            settings = { ProjectInfo: { enable: true } };

            await createService().migrate();

            expect(settings.Coder).to.be.undefined;
            expect(workspaceScopedSettings).to.deep.equal({ Coder: { enable: true } });
        });
    });
});
