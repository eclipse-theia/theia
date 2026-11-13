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
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
try { FrontendApplicationConfigProvider.set({}); } catch { /* already set by a sibling spec */ }

import { expect } from 'chai';
import { URI } from '@theia/core';
import { LocalDirectoryMount } from '@theia/filesystem/lib/browser-only/file-system-access/local-directory-mount-service';
import { FileSystemAccessPermissionState } from '@theia/filesystem/lib/browser-only/file-system-access/file-system-access-types';
import { LocalFolderFrontendContribution } from './local-folder-frontend-contribution.js';

disableJSDOM();

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve));

const mountUri = (path: string): URI => new URI(`file:///mounts/${path}`);

class TestContribution extends LocalFolderFrontendContribution {
    forget(): Promise<void> {
        return this.forgetLocalFolder();
    }
    prompt(): Promise<void> {
        return this.promptForMissingAccess();
    }
}

describe('LocalFolderFrontendContribution', () => {
    let contribution: TestContribution;
    let mounts: Map<string, Partial<LocalDirectoryMount>>;
    let recents: string[];
    let opened: URI[];
    let reloads: number;
    let prompts: string[];
    let workspace: URI | undefined;
    let requestedWorkspace: URI | undefined;
    let rootUris: URI[];

    const addMount = (name: string, permission: FileSystemAccessPermissionState): void => {
        mounts.set(name, { name, permission });
    };

    beforeEach(() => {
        mounts = new Map();
        recents = [];
        opened = [];
        reloads = 0;
        prompts = [];
        workspace = undefined;
        requestedWorkspace = undefined;
        rootUris = [];
        contribution = new TestContribution();
        const prefix = mountUri('').path;
        Object.assign(contribution, {
            mountService: {
                ready: Promise.resolve(),
                isSupported: () => true,
                getMount: (name: string) => mounts.get(name),
                getMounts: () => Array.from(mounts.values()),
                getMountPath: (uri: URI) => {
                    const relative = prefix.relative(uri.path);
                    return uri.scheme === 'file' && relative ? { name: relative.toString().split('/')[0], relative } : undefined;
                },
                unmount: async (name: string) => { mounts.delete(name); },
                requestAccess: async () => true
            },
            workspaceService: {
                get roots(): Promise<{ resource: URI }[]> {
                    return Promise.resolve(rootUris.map(resource => ({ resource })));
                },
                tryGetRoots: () => rootUris.map(resource => ({ resource })),
                get workspace(): { resource: URI } | undefined {
                    return workspace && { resource: workspace };
                },
                get requestedWorkspace(): URI | undefined {
                    return requestedWorkspace;
                },
                recentWorkspaces: async () => [...recents],
                removeRecentWorkspace: async (uri: string) => { recents = recents.filter(recent => recent !== uri); },
                open: (uri: URI) => opened.push(uri)
            },
            quickInputService: { showQuickPick: async () => ({ label: 'a' }) },
            messageService: {
                info: async (message: string, action: string) => {
                    prompts.push(message);
                    return action;
                }
            },
            windowService: { reload: () => reloads++ },
            logger: { error: (message: string, error: unknown) => { throw error; } }
        });
    });

    describe('forgetting a local folder', () => {
        it('removes the recent workspaces inside of it', async () => {
            addMount('a', 'granted');
            recents = [
                mountUri('a').toString(),
                '',
                'file:///opfs/project',
                mountUri('a/project.theia-workspace').toString(),
                mountUri('ab').toString()
            ];

            await contribution.forget();

            expect(mounts.has('a')).to.be.false;
            expect(recents).to.deep.equal(['', 'file:///opfs/project', mountUri('ab').toString()]);
        });

        it('keeps the recent workspaces if the folder is still in use', async () => {
            addMount('a', 'granted');
            rootUris = [mountUri('a')];
            recents = [mountUri('a').toString()];
            Object.assign(contribution, { messageService: { warn: async () => undefined } });

            await contribution.forget();

            expect(mounts.has('a')).to.be.true;
            expect(recents).to.deep.equal([mountUri('a').toString()]);
        });
    });

    describe('prompting for missing access', () => {
        it('reopens a workspace file inside of a mount that could not be read', async () => {
            addMount('a', 'prompt');
            requestedWorkspace = mountUri('a/project.theia-workspace');

            await contribution.prompt();
            await flush();

            expect(prompts).to.have.length(1);
            expect(opened.map(uri => uri.toString())).to.deep.equal([requestedWorkspace.toString()]);
            expect(reloads).to.equal(0);
        });

        it('reopens the requested workspace if another one was opened as fallback', async () => {
            addMount('a', 'prompt');
            requestedWorkspace = mountUri('a/project.theia-workspace');
            workspace = new URI('file:///opfs/project');
            rootUris = [workspace];

            await contribution.prompt();
            await flush();

            expect(opened.map(uri => uri.toString())).to.deep.equal([requestedWorkspace.toString()]);
        });

        it('reloads if the workspace itself could be opened', async () => {
            addMount('a', 'prompt');
            workspace = requestedWorkspace = mountUri('a');
            rootUris = [workspace];

            await contribution.prompt();
            await flush();

            expect(opened).to.be.empty;
            expect(reloads).to.equal(1);
        });

        it('does not prompt for workspaces outside of mounts or with granted access', async () => {
            addMount('a', 'granted');
            requestedWorkspace = mountUri('a/project.theia-workspace');
            await contribution.prompt();
            requestedWorkspace = new URI('file:///opfs/project.theia-workspace');
            await contribution.prompt();
            await flush();

            expect(prompts).to.be.empty;
        });
    });
});
