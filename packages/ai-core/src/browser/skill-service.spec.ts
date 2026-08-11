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
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import * as sinon from 'sinon';
import { parseSkillFile, combineSkillDirectories } from '../common/skill';
import { Path } from '@theia/core/lib/common/path';
import { Disposable, Emitter, ILogger, Logger, URI } from '@theia/core';
import { FileChangesEvent } from '@theia/filesystem/lib/common/files';
import { DefaultSkillService } from './skill-service';

disableJSDOM();

describe('SkillService', () => {
    describe('tilde expansion', () => {
        it('should expand ~ to home directory in configured paths', () => {
            const homePath = '/home/testuser';
            const configuredDirectories = ['~/skills', '~/.theia/skills', '/absolute/path'];

            const expanded = configuredDirectories.map(dir => Path.untildify(dir, homePath));

            expect(expanded).to.deep.equal([
                '/home/testuser/skills',
                '/home/testuser/.theia/skills',
                '/absolute/path'
            ]);
        });

        it('should handle empty home path gracefully', () => {
            const configuredDirectories = ['~/skills'];
            const expanded = configuredDirectories.map(dir => Path.untildify(dir, ''));

            // With empty home, tilde is not expanded
            expect(expanded).to.deep.equal(['~/skills']);
        });
    });

    describe('directory prioritization', () => {
        it('workspace directories come first when all directories provided', () => {
            const result = combineSkillDirectories(
                ['/workspace/.prompts/skills', '/workspace/.agents/skills'],
                ['/custom/skills1', '/custom/skills2'],
                ['/home/user/.theia/skills', '/home/user/.agents/skills']
            );

            expect(result).to.deep.equal([
                { path: '/workspace/.prompts/skills', tier: 'workspace' },
                { path: '/workspace/.agents/skills', tier: 'workspace' },
                { path: '/custom/skills1', tier: 'configured' },
                { path: '/custom/skills2', tier: 'configured' },
                { path: '/home/user/.theia/skills', tier: 'default' },
                { path: '/home/user/.agents/skills', tier: 'default' }
            ]);
        });

        it('preserves the workspace-tier order: .prompts/skills wins over .agents/skills on duplicate skill names', () => {
            // The `.prompts/skills` directory is intentionally listed first within the workspace tier
            // because it is the Theia-explicit folder; users opting into it signal stronger intent than
            // those relying on the generic `.agents/skills` convention.
            const result = combineSkillDirectories(
                ['/workspace/.prompts/skills', '/workspace/.agents/skills'],
                [],
                []
            );

            expect(result.map(entry => entry.path)).to.deep.equal([
                '/workspace/.prompts/skills',
                '/workspace/.agents/skills'
            ]);
        });

        it('works without workspace directories', () => {
            const result = combineSkillDirectories(
                [],
                ['/custom/skills'],
                ['/home/user/.theia/skills']
            );

            expect(result).to.deep.equal([
                { path: '/custom/skills', tier: 'configured' },
                { path: '/home/user/.theia/skills', tier: 'default' }
            ]);
        });

        it('works with only default directories', () => {
            const result = combineSkillDirectories(
                [],
                [],
                ['/home/user/.theia/skills', '/home/user/.agents/skills']
            );

            expect(result).to.deep.equal([
                { path: '/home/user/.theia/skills', tier: 'default' },
                { path: '/home/user/.agents/skills', tier: 'default' }
            ]);
        });

        it('deduplicates workspace directory if also in configured', () => {
            const result = combineSkillDirectories(
                ['/workspace/.prompts/skills'],
                ['/workspace/.prompts/skills', '/custom/skills'],
                ['/home/user/.theia/skills']
            );

            expect(result).to.deep.equal([
                { path: '/workspace/.prompts/skills', tier: 'workspace' },
                { path: '/custom/skills', tier: 'configured' },
                { path: '/home/user/.theia/skills', tier: 'default' }
            ]);
        });

        it('deduplicates default directory if also in configured', () => {
            const result = combineSkillDirectories(
                ['/workspace/.prompts/skills'],
                ['/home/user/.theia/skills'],
                ['/home/user/.theia/skills']
            );

            expect(result).to.deep.equal([
                { path: '/workspace/.prompts/skills', tier: 'workspace' },
                { path: '/home/user/.theia/skills', tier: 'configured' }
            ]);
        });

        it('handles empty configured directories', () => {
            const result = combineSkillDirectories(
                ['/workspace/.prompts/skills'],
                [],
                ['/home/user/.theia/skills']
            );

            expect(result).to.deep.equal([
                { path: '/workspace/.prompts/skills', tier: 'workspace' },
                { path: '/home/user/.theia/skills', tier: 'default' }
            ]);
        });

        it('handles empty default directories', () => {
            const result = combineSkillDirectories(
                ['/workspace/.prompts/skills'],
                ['/custom/skills'],
                []
            );

            expect(result).to.deep.equal([
                { path: '/workspace/.prompts/skills', tier: 'workspace' },
                { path: '/custom/skills', tier: 'configured' }
            ]);
        });

        it('deduplicates duplicate workspace directories', () => {
            const result = combineSkillDirectories(
                ['/workspace/.prompts/skills', '/workspace/.prompts/skills'],
                [],
                []
            );

            expect(result).to.deep.equal([
                { path: '/workspace/.prompts/skills', tier: 'workspace' }
            ]);
        });
    });

    describe('parseSkillFile', () => {
        it('extracts YAML front matter correctly', () => {
            const fileContent = `---
name: my-skill
description: A test skill for testing purposes
license: MIT
compatibility: ">=1.0.0"
metadata:
  author: test
  version: "1.0.0"
---
# My Skill

This is the skill content.`;

            const result = parseSkillFile(fileContent);

            expect(result.content).to.equal(`# My Skill

This is the skill content.`);
            expect(result.metadata).to.not.be.undefined;
            expect(result.metadata?.name).to.equal('my-skill');
            expect(result.metadata?.description).to.equal('A test skill for testing purposes');
            expect(result.metadata?.license).to.equal('MIT');
            expect(result.metadata?.compatibility).to.equal('>=1.0.0');
            expect(result.metadata?.metadata).to.deep.equal({ author: 'test', version: '1.0.0' });
        });

        it('returns content without metadata when no front matter exists', () => {
            const fileContent = '# Just a regular markdown file';

            const result = parseSkillFile(fileContent);

            expect(result.content).to.equal('# Just a regular markdown file');
            expect(result.metadata).to.be.undefined;
        });

        it('handles missing front matter gracefully', () => {
            const fileContent = `---
This is not valid YAML front matter
Skill content`;

            const result = parseSkillFile(fileContent);

            expect(result.content).to.equal(fileContent);
            expect(result.metadata).to.be.undefined;
        });

        it('handles invalid YAML gracefully', () => {
            const fileContent = `---
name: my-skill
description: [unclosed array
---
Skill content`;

            const result = parseSkillFile(fileContent);

            expect(result.content).to.equal(fileContent);
            expect(result.metadata).to.be.undefined;
        });

        it('handles minimal required fields', () => {
            const fileContent = `---
name: minimal-skill
description: A minimal skill
---
Content`;

            const result = parseSkillFile(fileContent);

            expect(result.content).to.equal('Content');
            expect(result.metadata?.name).to.equal('minimal-skill');
            expect(result.metadata?.description).to.equal('A minimal skill');
            expect(result.metadata?.license).to.be.undefined;
            expect(result.metadata?.compatibility).to.be.undefined;
            expect(result.metadata?.metadata).to.be.undefined;
        });

        it('handles allowedTools field', () => {
            const fileContent = `---
name: tool-skill
description: A skill with allowed tools
allowedTools:
  - tool1
  - tool2
---
Content`;

            const result = parseSkillFile(fileContent);

            expect(result.metadata?.allowedTools).to.deep.equal(['tool1', 'tool2']);
        });

        it('preserves markdown content with special characters', () => {
            const fileContent = `---
name: special-skill
description: Test
---
# Skill with {{variable}} and \`code\` and **bold**

\`\`\`javascript
const x = 1;
\`\`\``;

            const result = parseSkillFile(fileContent);

            expect(result.content).to.contain('{{variable}}');
            expect(result.content).to.contain('`code`');
            expect(result.content).to.contain('**bold**');
            expect(result.content).to.contain('const x = 1;');
        });

        it('handles empty content after front matter', () => {
            const fileContent = `---
name: empty-content
description: Skill with no content
---
`;

            const result = parseSkillFile(fileContent);

            expect(result.metadata?.name).to.equal('empty-content');
            expect(result.content).to.equal('');
        });
    });

    describe('parent directory watching', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let fileServiceMock: any;
        let loggerWarnSpy: sinon.SinonStub;
        let loggerInfoSpy: sinon.SinonStub;
        let loggerDebugSpy: sinon.SinonStub;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let envVariablesServerMock: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let workspaceServiceMock: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let preferencesMock: any;
        let fileChangesEmitter: Emitter<FileChangesEvent>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let preferenceChangedEmitter: Emitter<any>;

        function createService(): DefaultSkillService {
            const service = new DefaultSkillService();
            (service as unknown as { preferences: unknown }).preferences = preferencesMock;
            (service as unknown as { fileService: unknown }).fileService = fileServiceMock;
            const loggerMock: ILogger = sinon.createStubInstance(Logger);
            loggerMock.warn = loggerWarnSpy;
            loggerMock.info = loggerInfoSpy;
            loggerMock.debug = loggerDebugSpy;
            (service as unknown as { logger: unknown }).logger = loggerMock;
            (service as unknown as { envVariablesServer: unknown }).envVariablesServer = envVariablesServerMock;
            (service as unknown as { workspaceService: unknown }).workspaceService = workspaceServiceMock;
            return service;
        }

        beforeEach(() => {
            fileChangesEmitter = new Emitter<FileChangesEvent>();
            preferenceChangedEmitter = new Emitter();

            fileServiceMock = {
                exists: sinon.stub(),
                watch: sinon.stub().returns(Disposable.NULL),
                resolve: sinon.stub(),
                read: sinon.stub(),
                onDidFilesChange: (listener: (e: FileChangesEvent) => void) => fileChangesEmitter.event(listener)
            };

            loggerWarnSpy = sinon.stub();
            loggerInfoSpy = sinon.stub();
            loggerDebugSpy = sinon.stub();

            envVariablesServerMock = {
                getHomeDirUri: sinon.stub().resolves('file:///home/testuser'),
                getConfigDirUri: sinon.stub().resolves('file:///home/testuser/.theia-ide')
            };

            workspaceServiceMock = {
                ready: Promise.resolve(),
                tryGetRoots: sinon.stub().returns([]),
                onWorkspaceChanged: sinon.stub().returns(Disposable.NULL)
            };

            preferencesMock = {
                'ai-features.skills.skillDirectories': [],
                onPreferenceChanged: preferenceChangedEmitter.event
            };
        });

        afterEach(() => {
            sinon.restore();
            fileChangesEmitter.dispose();
            preferenceChangedEmitter.dispose();
        });

        it('should watch parent directory when skills directory does not exist', async () => {
            const service = createService();

            // Default skills directory does not exist, but parent does
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.theia-ide/skills'))
                .resolves(false);
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.theia-ide'))
                .resolves(true);

            // Call init to trigger update
            (service as unknown as { init: () => void }).init();
            await workspaceServiceMock.ready;
            // Allow async operations to complete
            await new Promise(resolve => setTimeout(resolve, 10));

            // Verify parent directory is watched
            expect(fileServiceMock.watch.calledWith(
                sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.theia-ide'),
                sinon.match({ recursive: false, excludes: [] })
            )).to.be.true;

            // Verify debug log about watching parent (demoted from info to keep startup quiet)
            expect(loggerDebugSpy.calledWith(
                sinon.match(/Watching parent directory.*for skills folder creation/)
            )).to.be.true;
            // And the same line must not be emitted at info level any more.
            expect(loggerInfoSpy.calledWith(
                sinon.match(/Watching parent directory/)
            )).to.be.false;
        });

        it('should log a debug entry when parent directory does not exist', async () => {
            const service = createService();

            // Neither skills directory nor parent exists
            fileServiceMock.exists.resolves(false);

            // Call init to trigger update
            (service as unknown as { init: () => void }).init();
            await workspaceServiceMock.ready;
            await new Promise(resolve => setTimeout(resolve, 10));

            // The absent-default-tree case is expected on fresh machines and is now debug-level only.
            expect(loggerDebugSpy.calledWith(
                sinon.match(/Cannot watch skills directory.*parent directory does not exist/)
            )).to.be.true;
            // It must no longer surface as a startup warning.
            expect(loggerWarnSpy.calledWith(
                sinon.match(/Cannot watch skills directory.*parent directory does not exist/)
            )).to.be.false;
        });

        it('coalesces concurrent update() calls so a single scan runs at a time', async () => {
            const service = createService();

            // Default skills directory does not exist, but parent does, so each update logs once.
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.theia-ide/skills'))
                .resolves(false);
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.theia-ide'))
                .resolves(true);

            // Drive two updates in the same tick - the second must be coalesced into a follow-up
            // re-schedule rather than racing the first and producing duplicated log lines.
            const update = (service as unknown as { update: () => Promise<void> }).update.bind(service);
            await Promise.all([update(), update()]);
            // Give the rescheduled run (debounced via scheduleUpdate) time to fire.
            await new Promise(resolve => setTimeout(resolve, 80));

            // The watcher must be installed (the underlying scan must have run); the same log line
            // must have been emitted at most once per scan, never twice from interleaved scans.
            const matchingDebugCalls = loggerDebugSpy.getCalls().filter(call =>
                /Watching parent directory.*for skills folder creation/.test(String(call.args[0]))
            );
            // Two scans (initial + rescheduled) are allowed, but never more, and never zero.
            expect(matchingDebugCalls.length).to.be.greaterThan(0);
            expect(matchingDebugCalls.length).to.be.lessThan(3);
        });

        it('should log warning for non-existent configured directories', async () => {
            const service = createService();

            // Set up configured directory that doesn't exist
            (preferencesMock as Record<string, unknown>)['ai-features.skills.skillDirectories'] = ['/custom/nonexistent/skills'];

            // Default skills directory exists (to avoid additional warnings)
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.theia-ide/skills'))
                .resolves(true);
            fileServiceMock.resolve
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.theia-ide/skills'))
                .resolves({ children: [] });

            // Configured directory does not exist
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/custom/nonexistent/skills'))
                .resolves(false);

            // Call init to trigger update
            (service as unknown as { init: () => void }).init();
            await workspaceServiceMock.ready;
            await new Promise(resolve => setTimeout(resolve, 10));

            // Verify warning is logged for non-existent configured directory
            expect(loggerWarnSpy.calledWith(
                sinon.match(/Configured skill directory.*does not exist/)
            )).to.be.true;
        });

        it('should load skills when directory is created after initialization', async () => {
            const service = createService();

            // Initially, skills directory does not exist but parent does
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.theia-ide/skills'))
                .resolves(false);
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.theia-ide'))
                .resolves(true);

            // Call init to trigger initial update
            (service as unknown as { init: () => void }).init();
            await workspaceServiceMock.ready;
            await new Promise(resolve => setTimeout(resolve, 10));

            // Verify no skills initially
            expect(service.getSkills()).to.have.length(0);

            // Now simulate skills directory being created with a skill
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.theia-ide/skills'))
                .resolves(true);
            fileServiceMock.resolve
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.theia-ide/skills'))
                .resolves({
                    children: [{
                        isDirectory: true,
                        name: 'test-skill',
                        resource: URI.fromFilePath('/home/testuser/.theia-ide/skills/test-skill')
                    }]
                });
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.theia-ide/skills/test-skill/SKILL.md'))
                .resolves(true);
            fileServiceMock.read
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.theia-ide/skills/test-skill/SKILL.md'))
                .resolves({
                    value: `---
name: test-skill
description: A test skill
---
Test skill content`
                });

            // Simulate file change event for skills directory creation
            fileChangesEmitter.fire({
                changes: [{
                    type: 1, // FileChangeType.ADDED
                    resource: URI.fromFilePath('/home/testuser/.theia-ide/skills')
                }],
                rawChanges: []
            } as unknown as FileChangesEvent);

            // Wait for async operations to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify skill was loaded
            const skills = service.getSkills();
            expect(skills).to.have.length(1);
            expect(skills[0].name).to.equal('test-skill');
        });

        it('prefers a workspace `.prompts/skills` skill over a same-named `.agents/skills` skill in the same root', async () => {
            const service = createService();

            workspaceServiceMock.tryGetRoots.returns([
                { resource: URI.fromFilePath('/workspace') }
            ]);

            // Stub default skill directories as non-existent to keep focus on workspace behavior.
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.theia-ide/skills'))
                .resolves(false);
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.theia-ide'))
                .resolves(false);
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.agents/skills'))
                .resolves(false);
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === '/home/testuser/.agents'))
                .resolves(false);

            // Both workspace skill directories exist and contain a `dup-skill` directory.
            const promptsSkillDir = '/workspace/.prompts/skills';
            const agentsSkillDir = '/workspace/.agents/skills';
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === promptsSkillDir))
                .resolves(true);
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === agentsSkillDir))
                .resolves(true);
            fileServiceMock.resolve
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === promptsSkillDir))
                .resolves({
                    children: [{
                        isDirectory: true,
                        name: 'dup-skill',
                        resource: URI.fromFilePath(`${promptsSkillDir}/dup-skill`)
                    }]
                });
            fileServiceMock.resolve
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === agentsSkillDir))
                .resolves({
                    children: [{
                        isDirectory: true,
                        name: 'dup-skill',
                        resource: URI.fromFilePath(`${agentsSkillDir}/dup-skill`)
                    }]
                });

            // Each tier provides its own SKILL.md so we can distinguish them by location.
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === `${promptsSkillDir}/dup-skill/SKILL.md`))
                .resolves(true);
            fileServiceMock.exists
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === `${agentsSkillDir}/dup-skill/SKILL.md`))
                .resolves(true);
            fileServiceMock.read
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === `${promptsSkillDir}/dup-skill/SKILL.md`))
                .resolves({
                    value: '---\nname: dup-skill\ndescription: from prompts\n---\nFrom prompts'
                });
            fileServiceMock.read
                .withArgs(sinon.match((uri: URI) => uri.path.toString() === `${agentsSkillDir}/dup-skill/SKILL.md`))
                .resolves({
                    value: '---\nname: dup-skill\ndescription: from agents\n---\nFrom agents'
                });

            (service as unknown as { init: () => void }).init();
            await workspaceServiceMock.ready;
            await new Promise(resolve => setTimeout(resolve, 10));

            const skill = service.getSkill('dup-skill');
            expect(skill, 'dup-skill should be discovered').to.not.be.undefined;
            expect(skill!.description).to.equal('from prompts');
            expect(skill!.location).to.equal(new Path(`${promptsSkillDir}/dup-skill/SKILL.md`).fsPath());
            // The second occurrence is reported (not silently swallowed) via a warning.
            expect(loggerWarnSpy.calledWith(
                sinon.match(/Duplicate skill found.*dup-skill/)
            )).to.be.true;
        });
    });
});
