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
import { URI } from '@theia/core';
import { AgentsMdFile, AgentsMdService } from './agents-md-service';
import { AGENTS_MD_AUTO_LOADED_VARIABLE, AGENTS_MD_CONTENT_VARIABLE, AGENTS_MD_VARIABLE, AgentsMdVariableContribution } from './agents-md-variable-contribution';
import { AIVariableContext } from '../common/variable-service';

disableJSDOM();

describe('AgentsMdVariableContribution', () => {

    function file(rootName: string, content: string): AgentsMdFile {
        return { uri: new URI(`file:///${rootName}/AGENTS.md`), content, rootName };
    }

    /**
     * @param rootCount how many workspace roots are open. Defaults to one per discovered file, which
     * is the ordinary case; pass it explicitly to build a workspace whose root count and file count
     * differ, since auto-loading keys on roots rather than files.
     */
    function createContribution(files: AgentsMdFile[], rootCount = files.length): AgentsMdVariableContribution {
        const contribution = new AgentsMdVariableContribution();
        const service: AgentsMdService = {
            getAgentsMdFiles: () => files,
            onDidChange: () => ({ dispose: () => { } }),
            ready: Promise.resolve()
        };
        (contribution as unknown as { agentsMdService: AgentsMdService }).agentsMdService = service;
        (contribution as unknown as { workspaceService: unknown }).workspaceService = {
            tryGetRoots: () => new Array(rootCount).fill({})
        };
        return contribution;
    }

    async function resolve(files: AgentsMdFile[], variable: typeof AGENTS_MD_VARIABLE, rootCount?: number): Promise<string> {
        const resolved = await createContribution(files, rootCount).resolve({ variable }, {} as AIVariableContext);
        return resolved!.value;
    }

    describe('agentsMdAutoLoaded', () => {
        it('resolves to nothing when the workspace has no AGENTS.md', async () => {
            expect(await resolve([], AGENTS_MD_AUTO_LOADED_VARIABLE, 1)).to.equal('');
        });

        it('inlines the root file when the workspace has a single root', async () => {
            expect(await resolve([file('theia', '# Project\n\nUse npm.')], AGENTS_MD_AUTO_LOADED_VARIABLE)).to.equal(
                '<project_instructions path="theia/AGENTS.md">\n# Project\n\nUse npm.\n</project_instructions>'
            );
        });

        it('loads nothing once the workspace has more than one root', async () => {
            expect(await resolve([file('a', 'x'), file('b', 'y')], AGENTS_MD_AUTO_LOADED_VARIABLE)).to.equal('');
        });

        it('loads nothing in a multi-root workspace where only one root has a file', async () => {
            // Keyed on root count, not file count: a workspace with several roots has no single
            // project root, even when only one of them carries an AGENTS.md.
            expect(await resolve([file('a', 'x')], AGENTS_MD_AUTO_LOADED_VARIABLE, 2)).to.equal('');
        });

        it('escapes the path but leaves the Markdown content untouched', async () => {
            const resolved = await resolve([file('a&b', '# Heading <not xml> & "quoted"')], AGENTS_MD_AUTO_LOADED_VARIABLE, 1);
            expect(resolved).to.contain('path="a&amp;b/AGENTS.md"');
            expect(resolved).to.contain('# Heading <not xml> & "quoted"');
        });
    });

    describe('agentsMd', () => {
        it('resolves to nothing when the workspace has no AGENTS.md', async () => {
            expect(await resolve([], AGENTS_MD_VARIABLE)).to.equal('');
        });

        it('advertises nothing when the single root file is already loaded', async () => {
            // Otherwise the model is told to read a file it has just been handed.
            expect(await resolve([file('theia', 'x')], AGENTS_MD_VARIABLE)).to.equal('');
        });

        it('advertises one entry per root once there is more than one root', async () => {
            expect(await resolve([file('a', 'x'), file('b', 'y')], AGENTS_MD_VARIABLE)).to.equal(
                '<agents_md_files>\n<file>a/AGENTS.md</file>\n<file>b/AGENTS.md</file>\n</agents_md_files>'
            );
        });

        it('advertises the single file of a multi-root workspace rather than loading it', async () => {
            expect(await resolve([file('a', 'x')], AGENTS_MD_VARIABLE, 2)).to.equal(
                '<agents_md_files>\n<file>a/AGENTS.md</file>\n</agents_md_files>'
            );
        });

        it('escapes XML in the root name', async () => {
            expect(await resolve([file('a&b', 'x')], AGENTS_MD_VARIABLE, 2)).to.contain('<file>a&amp;b/AGENTS.md</file>');
        });

        it('never inlines the content', async () => {
            expect(await resolve([file('a', 'secret project conventions'), file('b', 'y')], AGENTS_MD_VARIABLE))
                .to.not.contain('secret project conventions');
        });
    });

    describe('the two are mutually exclusive', () => {
        it('never emits both for the same workspace', async () => {
            for (const [files, roots] of [
                [[file('theia', 'x')], 1],
                [[file('a', 'x'), file('b', 'y')], 2],
                [[file('a', 'x')], 2],
                [[], 1]
            ] as [AgentsMdFile[], number][]) {
                const loaded = await resolve(files, AGENTS_MD_AUTO_LOADED_VARIABLE, roots);
                const listed = await resolve(files, AGENTS_MD_VARIABLE, roots);
                expect(loaded === '' || listed === '', `both were non-empty for ${roots} root(s)`).to.be.true;
            }
        });
    });

    describe('agentsMdContent', () => {
        it('resolves to nothing when the workspace has no AGENTS.md', async () => {
            expect(await resolve([], AGENTS_MD_CONTENT_VARIABLE)).to.equal('');
        });

        it('inlines a single root verbatim, without provenance framing', async () => {
            expect(await resolve([file('theia', '# Project\n\nUse npm.')], AGENTS_MD_CONTENT_VARIABLE)).to.equal('# Project\n\nUse npm.');
        });

        it('labels the sources when several roots contribute', async () => {
            expect(await resolve([file('a', 'first'), file('b', 'second')], AGENTS_MD_CONTENT_VARIABLE)).to.equal(
                '### a\n\nfirst\n\n### b\n\nsecond'
            );
        });
    });

    describe('canResolve', () => {
        it('claims all three variables and nothing else', () => {
            const contribution = createContribution([]);
            const context = {} as AIVariableContext;
            expect(contribution.canResolve({ variable: AGENTS_MD_AUTO_LOADED_VARIABLE }, context)).to.equal(1);
            expect(contribution.canResolve({ variable: AGENTS_MD_VARIABLE }, context)).to.equal(1);
            expect(contribution.canResolve({ variable: AGENTS_MD_CONTENT_VARIABLE }, context)).to.equal(1);
            expect(contribution.canResolve({ variable: { id: 'other', name: 'other', description: '' } }, context)).to.equal(-1);
        });
    });
});
