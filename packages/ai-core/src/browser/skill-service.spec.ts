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
        it('workspace directory comes first when all directories provided', () => {
            const result = combineSkillDirectories(
                '/workspace/.prompts/skills',
                ['/custom/skills1', '/custom/skills2'],
                '/home/user/.theia/skills'
            );

            expect(result).to.deep.equal([
                '/workspace/.prompts/skills',
                '/custom/skills1',
                '/custom/skills2',
                '/home/user/.theia/skills'
            ]);
        });

        it('works without workspace directory', () => {
            const result = combineSkillDirectories(
                undefined,
                ['/custom/skills'],
                '/home/user/.theia/skills'
            );

            expect(result).to.deep.equal([
                '/custom/skills',
                '/home/user/.theia/skills'
            ]);
        });

        it('works with only default directory', () => {
            const result = combineSkillDirectories(
                undefined,
                [],
                '/home/user/.theia/skills'
            );

            expect(result).to.deep.equal(['/home/user/.theia/skills']);
        });

        it('deduplicates workspace directory if also in configured', () => {
            const result = combineSkillDirectories(
                '/workspace/.prompts/skills',
                ['/workspace/.prompts/skills', '/custom/skills'],
                '/home/user/.theia/skills'
            );

            expect(result).to.deep.equal([
                '/workspace/.prompts/skills',
                '/custom/skills',
                '/home/user/.theia/skills'
            ]);
        });

        it('deduplicates default directory if also in configured', () => {
            const result = combineSkillDirectories(
                '/workspace/.prompts/skills',
                ['/home/user/.theia/skills'],
                '/home/user/.theia/skills'
            );

            expect(result).to.deep.equal([
                '/workspace/.prompts/skills',
                '/home/user/.theia/skills'
            ]);
        });

        it('handles empty configured directories', () => {
            const result = combineSkillDirectories(
                '/workspace/.prompts/skills',
                [],
                '/home/user/.theia/skills'
            );

            expect(result).to.deep.equal([
                '/workspace/.prompts/skills',
                '/home/user/.theia/skills'
            ]);
        });

        it('handles undefined default directory', () => {
            const result = combineSkillDirectories(
                '/workspace/.prompts/skills',
                ['/custom/skills'],
                undefined
            );

            expect(result).to.deep.equal([
                '/workspace/.prompts/skills',
                '/custom/skills'
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

            // Verify info log about watching parent
            expect(loggerInfoSpy.calledWith(
                sinon.match(/Watching parent directory.*for skills folder creation/)
            )).to.be.true;
        });

        it('should log warning when parent directory does not exist', async () => {
            const service = createService();

            // Neither skills directory nor parent exists
            fileServiceMock.exists.resolves(false);

            // Call init to trigger update
            (service as unknown as { init: () => void }).init();
            await workspaceServiceMock.ready;
            await new Promise(resolve => setTimeout(resolve, 10));

            // Verify warning is logged about parent not existing
            expect(loggerWarnSpy.calledWith(
                sinon.match(/Cannot watch skills directory.*parent directory does not exist/)
            )).to.be.true;
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
    });
});
