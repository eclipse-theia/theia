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

import { Emitter, Event, URI } from '@theia/core';
import { FileChangesEvent, FileChangeType } from '@theia/filesystem/lib/common/files';
import { expect } from 'chai';
import { FileReadTrackerImpl } from './file-read-tracker-impl';

disableJSDOM();

const SESSION = 'session-1';
const OTHER_SESSION = 'session-2';
const FILE = new URI('file:///workspace/a.ts');
const FILE_LABEL = '/workspace/a.ts';

/** Drives the tracker against in-memory content: `contents` stands in for whatever `readCurrentContent` would resolve. */
class TestFileReadTracker extends FileReadTrackerImpl {
    readonly contents = new Map<string, string>([[FILE.toString(), 'original']]);
    /** Makes reading fail, as an unreadable file or a disposed document would. */
    readFails = false;
    protected override readonly maxFilesPerSession = 2;
    protected readonly fileChangeEmitter = new Emitter<FileChangesEvent>();
    protected readonly documentChangeEmitter = new Emitter<string>();

    constructor() {
        super();
        // `@postConstruct` only runs on container resolution, so wire the listeners here.
        this.init();
    }

    protected override get fileChanges(): Event<FileChangesEvent> {
        return this.fileChangeEmitter.event;
    }

    protected override get documentChanges(): Event<string> {
        return this.documentChangeEmitter.event;
    }

    protected override async readCurrentContent(uri: URI): Promise<string> {
        const content = this.readFails ? undefined : this.contents.get(uri.toString());
        if (content === undefined) {
            throw new Error(`cannot read ${uri}`);
        }
        return content;
    }

    protected override getLabel(uri: URI): string {
        return uri.path.toString();
    }

    /** Records what the agent saw, as `getFileContent` does. */
    agentRead(uri = FILE, sessionId = SESSION): Promise<void> {
        return this.recordRead(sessionId, uri, this.contents.get(uri.toString()));
    }

    /** Changes content behind the agent's back and notifies the tracker, as the workspace would. */
    somebodyElseChanges(content: string, uri = FILE): void {
        this.contents.set(uri.toString(), content);
        this.fileChanged(uri);
    }

    somebodyElseDeletes(uri = FILE): void {
        this.contents.delete(uri.toString());
        this.fileChanged(uri);
    }

    fileChanged(...uris: URI[]): void {
        this.fileChangeEmitter.fire(new FileChangesEvent(uris.map(resource => ({ resource, type: FileChangeType.UPDATED }))));
    }

    documentChanged(uri = FILE): void {
        this.documentChangeEmitter.fire(uri.toString());
    }
}

describe('FileReadTrackerImpl', () => {

    it('reports a file that changed after it was read', async () => {
        const tracker = new TestFileReadTracker();
        await tracker.agentRead();

        tracker.somebodyElseChanges('changed');

        expect(await tracker.getChangedFiles(SESSION)).to.deep.equal([FILE_LABEL]);
        expect(await tracker.isStale(SESSION, FILE)).to.be.true;
    });

    it('reports a file whose unsaved document changed', async () => {
        const tracker = new TestFileReadTracker();
        await tracker.agentRead();

        tracker.contents.set(FILE.toString(), 'the user typed something');
        tracker.documentChanged();

        expect(await tracker.getChangedFiles(SESSION)).to.deep.equal([FILE_LABEL]);
    });

    it('keeps reporting a change until the file is read again', async () => {
        const tracker = new TestFileReadTracker();
        await tracker.agentRead();
        tracker.somebodyElseChanges('changed');
        expect(await tracker.getChangedFiles(SESSION)).to.have.lengthOf(1);
        expect(await tracker.getChangedFiles(SESSION)).to.have.lengthOf(1);

        await tracker.agentRead();

        expect(await tracker.getChangedFiles(SESSION)).to.be.empty;
        expect(await tracker.isStale(SESSION, FILE)).to.be.false;
    });

    it('ignores files that were never read', async () => {
        const tracker = new TestFileReadTracker();

        tracker.somebodyElseChanges('changed');

        expect(await tracker.getChangedFiles(SESSION)).to.be.empty;
        expect(await tracker.isStale(SESSION, FILE)).to.be.false;
    });

    it('ignores a change that left the content untouched', async () => {
        const tracker = new TestFileReadTracker();
        await tracker.agentRead();

        // e.g. saving an unmodified document, or a formatter that had nothing to do
        tracker.fileChanged(FILE);

        expect(await tracker.getChangedFiles(SESSION)).to.be.empty;
        expect(await tracker.isStale(SESSION, FILE)).to.be.false;
    });

    it('stops reporting once an edit is undone', async () => {
        const tracker = new TestFileReadTracker();
        await tracker.agentRead();
        tracker.somebodyElseChanges('changed');
        expect(await tracker.getChangedFiles(SESSION)).to.have.lengthOf(1);

        tracker.somebodyElseChanges('original');

        expect(await tracker.getChangedFiles(SESSION)).to.be.empty;
    });

    it('reports a deleted file once, then forgets it and allows writing it', async () => {
        const tracker = new TestFileReadTracker();
        await tracker.agentRead();

        tracker.somebodyElseDeletes();

        expect(await tracker.getChangedFiles(SESSION)).to.deep.equal([FILE_LABEL]);
        expect(await tracker.getChangedFiles(SESSION)).to.be.empty;
        expect(await tracker.isStale(SESSION, FILE)).to.be.false;
    });

    it('forgets a file that no longer exists when it is recorded', async () => {
        const tracker = new TestFileReadTracker();
        await tracker.agentRead();
        tracker.somebodyElseDeletes();

        // as the change set element does after applying a deletion
        await tracker.recordRead(SESSION, FILE);

        expect(await tracker.getChangedFiles(SESSION)).to.be.empty;
    });

    it('reports a file it cannot read, and does not block writing it', async () => {
        const tracker = new TestFileReadTracker();
        await tracker.agentRead();
        tracker.fileChanged(FILE);
        tracker.readFails = true;

        expect(await tracker.getChangedFiles(SESSION)).to.deep.equal([FILE_LABEL]);
        expect(await tracker.isStale(SESSION, FILE)).to.be.false;
    });

    it('records nothing when the content cannot be read', async () => {
        const tracker = new TestFileReadTracker();
        tracker.readFails = true;

        await tracker.recordRead(SESSION, FILE);

        expect(await tracker.getChangedFiles(SESSION)).to.be.empty;
    });

    it('treats a write by another session as an external change', async () => {
        const tracker = new TestFileReadTracker();
        await tracker.agentRead();
        await tracker.agentRead(FILE, OTHER_SESSION);

        tracker.somebodyElseChanges('written by the other session');
        await tracker.recordRead(OTHER_SESSION, FILE);

        expect(await tracker.getChangedFiles(OTHER_SESSION)).to.be.empty;
        expect(await tracker.getChangedFiles(SESSION)).to.deep.equal([FILE_LABEL]);
    });

    it('evicts the least recently recorded file beyond the per-session limit', async () => {
        const tracker = new TestFileReadTracker();
        const files = ['a', 'b', 'c'].map(name => new URI(`file:///workspace/${name}.ts`));
        for (const uri of files) {
            tracker.contents.set(uri.toString(), 'original');
            await tracker.agentRead(uri);
        }

        files.forEach(uri => tracker.somebodyElseChanges('changed', uri));

        expect(await tracker.getChangedFiles(SESSION)).to.deep.equal(['/workspace/b.ts', '/workspace/c.ts']);
    });

    it('keeps a re-read file tracked, evicting the one untouched for longest', async () => {
        const tracker = new TestFileReadTracker();
        const [a, b, c] = ['a', 'b', 'c'].map(name => new URI(`file:///workspace/${name}.ts`));
        [a, b, c].forEach(uri => tracker.contents.set(uri.toString(), 'original'));
        await tracker.agentRead(a);
        await tracker.agentRead(b);
        await tracker.agentRead(a);
        await tracker.agentRead(c);

        tracker.somebodyElseChanges('changed', a);
        tracker.somebodyElseChanges('changed', b);

        expect(await tracker.getChangedFiles(SESSION)).to.deep.equal(['/workspace/a.ts']);
    });
});
