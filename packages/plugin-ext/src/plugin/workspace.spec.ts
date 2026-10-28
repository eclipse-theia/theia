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
// *****************************************************************************

import * as chai from 'chai';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { URI } from './types-impl';
import { WorkspaceExtImpl } from './workspace';

const expect = chai.expect;

/**
 * Tests the workspace trust event logic extracted from WorkspaceExtImpl.
 * This tests the core logic independently of the full WorkspaceExtImpl class
 * to avoid heavy dependency requirements.
 */
describe('WorkspaceExtImpl trust change logic', () => {
    // Extracted trust change logic for isolated testing
    class TrustChangeHandler {
        private _trusted?: boolean = undefined;
        private didGrantWorkspaceTrustEmitter = new Emitter<void>();
        readonly onDidGrantWorkspaceTrust: Event<void> = this.didGrantWorkspaceTrustEmitter.event;
        private didChangeWorkspaceTrustEmitter = new Emitter<boolean>();
        readonly onDidChangeWorkspaceTrust: Event<boolean> = this.didChangeWorkspaceTrustEmitter.event;

        dispose(): void {
            this.didGrantWorkspaceTrustEmitter.dispose();
            this.didChangeWorkspaceTrustEmitter.dispose();
        }

        get trusted(): boolean {
            return !!this._trusted;
        }

        $onWorkspaceTrustChanged(trust: boolean | undefined): void {
            const wasTrusted = this._trusted;
            this._trusted = trust;

            // Fire onDidChangeWorkspaceTrust if value actually changed
            if (wasTrusted !== trust && trust !== undefined) {
                this.didChangeWorkspaceTrustEmitter.fire(trust);
            }

            // Fire onDidGrantWorkspaceTrust when transitioning from untrusted to trusted
            if (!wasTrusted && trust) {
                this.didGrantWorkspaceTrustEmitter.fire();
            }
        }
    }

    let handler: TrustChangeHandler;
    let grantEvents: number;
    let changeEvents: boolean[];
    const disposables = new DisposableCollection();

    beforeEach(() => {
        handler = new TrustChangeHandler();
        disposables.push(handler);
        grantEvents = 0;
        changeEvents = [];

        handler.onDidGrantWorkspaceTrust(() => {
            grantEvents++;
        });
        handler.onDidChangeWorkspaceTrust(trust => {
            changeEvents.push(trust);
        });
    });

    afterEach(() => {
        disposables.dispose();
    });

    it('fires onDidChangeWorkspaceTrust when transitioning from undefined to true', () => {
        handler.$onWorkspaceTrustChanged(true);

        expect(changeEvents).to.deep.equal([true]);
        expect(grantEvents).to.equal(1);
    });

    it('fires onDidChangeWorkspaceTrust when transitioning from undefined to false', () => {
        handler.$onWorkspaceTrustChanged(false);

        expect(changeEvents).to.deep.equal([false]);
        expect(grantEvents).to.equal(0);
    });

    it('fires onDidGrantWorkspaceTrust when transitioning from false to true', () => {
        handler.$onWorkspaceTrustChanged(false);
        changeEvents = [];

        handler.$onWorkspaceTrustChanged(true);

        expect(changeEvents).to.deep.equal([true]);
        expect(grantEvents).to.equal(1);
    });

    it('fires onDidChangeWorkspaceTrust when transitioning from true to false', () => {
        handler.$onWorkspaceTrustChanged(true);
        changeEvents = [];
        grantEvents = 0;

        handler.$onWorkspaceTrustChanged(false);

        expect(changeEvents).to.deep.equal([false]);
        expect(grantEvents).to.equal(0);
    });

    it('does not fire events when value does not change', () => {
        handler.$onWorkspaceTrustChanged(true);
        changeEvents = [];
        grantEvents = 0;

        handler.$onWorkspaceTrustChanged(true);

        expect(changeEvents).to.deep.equal([]);
        expect(grantEvents).to.equal(0);
    });

    it('does not fire onDidChangeWorkspaceTrust when transitioning to undefined', () => {
        handler.$onWorkspaceTrustChanged(true);
        changeEvents = [];
        grantEvents = 0;

        handler.$onWorkspaceTrustChanged(undefined);

        expect(changeEvents).to.deep.equal([]);
        expect(grantEvents).to.equal(0);
    });

    it('always updates _trusted regardless of event firing', () => {
        expect(handler.trusted).to.equal(false); // undefined coerced to false

        handler.$onWorkspaceTrustChanged(true);
        expect(handler.trusted).to.equal(true);

        handler.$onWorkspaceTrustChanged(false);
        expect(handler.trusted).to.equal(false);

        handler.$onWorkspaceTrustChanged(undefined);
        expect(handler.trusted).to.equal(false); // undefined coerced to false
    });
});

describe('WorkspaceExtImpl workspace folders', () => {

    let workspace: WorkspaceExtImpl;

    beforeEach(() => {
        workspace = new WorkspaceExtImpl();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (workspace as any).proxy = { $getWorkspace: async () => undefined };
    });

    it('uses the names of the roots for the workspace folders', () => {
        workspace.$onWorkspaceFoldersChanged({
            roots: ['file:///project/backend', 'file:///project/frontend'],
            names: { 'file:///project/backend': 'API Server' }
        });
        expect(workspace.workspaceFolders?.map(folder => folder.name)).to.deep.equal(['API Server', 'frontend']);
    });

    it('updates the name of an existing workspace folder in place', () => {
        workspace.$onWorkspaceFoldersChanged({ roots: ['file:///project/backend'] });
        const folder = workspace.workspaceFolders![0];
        expect(folder.name).to.equal('backend');

        workspace.$onWorkspaceFoldersChanged({ roots: ['file:///project/backend'], names: { 'file:///project/backend': 'API Server' } });
        expect(workspace.workspaceFolders![0]).to.equal(folder);
        expect(folder.name).to.equal('API Server');

        workspace.$onWorkspaceFoldersChanged({ roots: ['file:///project/backend'] });
        expect(folder.name).to.equal('backend');
    });

    it('sends the names of the folders to add to the main side', () => {
        const calls: unknown[][] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (workspace as any).proxy = { $getWorkspace: async () => undefined, $updateWorkspaceFolders: async (...args: unknown[]) => { calls.push(args); } };
        workspace.$onWorkspaceFoldersChanged({ roots: ['file:///project/backend'] });

        const result = workspace.updateWorkspaceFolders(1, 0,
            { uri: URI.parse('file:///project/frontend'), name: 'Web Client' },
            { uri: URI.parse('file:///project/shared') }
        );
        expect(result).to.be.true;
        expect(calls).to.deep.equal([[1, 0, { uri: 'file:///project/frontend', name: 'Web Client' }, { uri: 'file:///project/shared', name: undefined }]]);
    });

    it('renames a folder that is replaced by itself with a new name', () => {
        const calls: unknown[][] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (workspace as any).proxy = { $getWorkspace: async () => undefined, $updateWorkspaceFolders: async (...args: unknown[]) => { calls.push(args); } };
        workspace.$onWorkspaceFoldersChanged({ roots: ['file:///project/backend', 'file:///project/frontend'] });

        const result = workspace.updateWorkspaceFolders(1, 1, { uri: URI.parse('file:///project/frontend'), name: 'Web Client' });
        expect(result).to.be.true;
        expect(calls).to.deep.equal([[1, 1, { uri: 'file:///project/frontend', name: 'Web Client' }]]);
    });

    it('does nothing if a folder is replaced by itself with the same name', () => {
        const calls: unknown[][] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (workspace as any).proxy = { $getWorkspace: async () => undefined, $updateWorkspaceFolders: async (...args: unknown[]) => { calls.push(args); } };
        workspace.$onWorkspaceFoldersChanged({ roots: ['file:///project/frontend'], names: { 'file:///project/frontend': 'Web Client' } });

        expect(workspace.updateWorkspaceFolders(0, 1, { uri: URI.parse('file:///project/frontend'), name: 'Web Client' })).to.be.false;
        expect(calls).to.be.empty;
    });

    it('resets the name of a folder that is replaced by itself without a name, like VS Code', () => {
        const calls: unknown[][] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (workspace as any).proxy = { $getWorkspace: async () => undefined, $updateWorkspaceFolders: async (...args: unknown[]) => { calls.push(args); } };
        workspace.$onWorkspaceFoldersChanged({ roots: ['file:///project/frontend'], names: { 'file:///project/frontend': 'Web Client' } });

        expect(workspace.updateWorkspaceFolders(0, 1, { uri: URI.parse('file:///project/frontend') })).to.be.true;
        expect(calls).to.deep.equal([[0, 1, { uri: 'file:///project/frontend', name: undefined }]]);
    });

    it('does not report a renamed folder as removed and added, like VS Code', () => {
        workspace.$onWorkspaceFoldersChanged({ roots: ['file:///project/frontend'] });
        const events: { added: readonly unknown[], removed: readonly unknown[] }[] = [];
        workspace.onDidChangeWorkspaceFolders(event => events.push(event));

        workspace.$onWorkspaceFoldersChanged({ roots: ['file:///project/frontend'], names: { 'file:///project/frontend': 'Web Client' } });
        expect(events).to.deep.equal([{ added: [], removed: [] }]);
        expect(workspace.workspaceFolders![0].name).to.equal('Web Client');
    });
});
