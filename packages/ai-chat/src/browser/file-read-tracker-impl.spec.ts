// *****************************************************************************
// Copyright (C) 2026 Ehab Younes.
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
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangesEvent, FileChangeType, FileOperationError, FileOperationResult, FileStat } from '@theia/filesystem/lib/common/files';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { expect } from 'chai';
import { FileReadTrackerImpl } from './file-read-tracker-impl';

disableJSDOM();

const SESSION = 'session-1';
const OTHER_SESSION = 'session-2';
const ROOT = new URI('file:///workspace');
const FILE = ROOT.resolve('a.ts');
/** As `resolveRelativePath` expects it back: root name plus path within that root. */
const FILE_LABEL = 'workspace/a.ts';

/** Drives the tracker against in-memory content: `contents` stands in for the files on disk. */
class TestFileReadTracker extends FileReadTrackerImpl {
    readonly contents = new Map<string, string>([[FILE.toString(), 'original']]);
    /** Makes reading fail as a file too large to compare would, rather than as a missing one. */
    readFails = false;
    /** Runs once inside a read, to change the file while the tracker is still reading it. */
    duringNextRead?: () => void;
    /** The encoding the files are stored in: `read` decodes with it, `readFile` hands back their bytes. */
    encoding: BufferEncoding = 'utf8';
    protected override readonly maxFilesPerSession = 2;
    /** The workspace roots labels are built against. */
    readonly roots = [ROOT];
    protected override readonly workspaceService = {
        tryGetRoots: () => this.roots.map(resource => ({ resource } as FileStat))
    } as WorkspaceService;
    protected override readonly monacoWorkspace = { getTextDocument: () => undefined } as unknown as MonacoWorkspace;
    /** Both decoders, so that a test can tell which one the tracker reads through. */
    protected override readonly fileService = {
        read: async (uri: URI) => ({ value: this.contentOf(uri) }),
        readFile: async (uri: URI) => ({ value: BinaryBuffer.wrap(Buffer.from(this.contentOf(uri), this.encoding)) })
    } as unknown as FileService;
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

    /** Stands in for the file on disk, failing the way the file service would. */
    protected contentOf(uri: URI): string {
        if (this.readFails) {
            throw new FileOperationError(`${uri} is too large`, FileOperationResult.FILE_TOO_LARGE);
        }
        const content = this.contents.get(uri.toString());
        if (content === undefined) {
            throw new FileOperationError(`${uri} does not exist`, FileOperationResult.FILE_NOT_FOUND);
        }
        const during = this.duringNextRead;
        this.duringNextRead = undefined;
        during?.();
        return content;
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

    it('keeps reporting a file it cannot read, and does not allow overwriting it', async () => {
        const tracker = new TestFileReadTracker();
        await tracker.agentRead();
        tracker.fileChanged(FILE);
        tracker.readFails = true;

        expect(await tracker.getChangedFiles(SESSION)).to.deep.equal([FILE_LABEL]);
        expect(await tracker.getChangedFiles(SESSION)).to.deep.equal([FILE_LABEL]);
        expect(await tracker.isStale(SESSION, FILE)).to.be.true;
    });

    it('reports a change made while the read recording it was still in flight', async () => {
        const tracker = new TestFileReadTracker();
        tracker.duringNextRead = () => {
            tracker.contents.set(FILE.toString(), 'the user typed something');
            tracker.documentChanged();
        };

        // no content handed in, so the tracker reads it itself
        await tracker.recordRead(SESSION, FILE);

        expect(await tracker.getChangedFiles(SESSION)).to.deep.equal([FILE_LABEL]);
        expect(await tracker.isStale(SESSION, FILE)).to.be.true;
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

    it('compares a file the read tools decode as UTF-16, not as UTF-8', async () => {
        const tracker = new TestFileReadTracker();
        tracker.encoding = 'utf16le'; // as a Windows-written `.ps1` is stored
        await tracker.agentRead();

        tracker.fileChanged(FILE);

        expect(await tracker.getChangedFiles(SESSION)).to.be.empty;
    });

    describe('naming changed files', () => {

        /** How the notice names `file` after it changed, in a workspace with the given extra roots. */
        async function nameOf(file: URI, ...extraRoots: URI[]): Promise<string[]> {
            const tracker = new TestFileReadTracker();
            tracker.roots.push(...extraRoots);
            tracker.contents.set(file.toString(), 'original');
            await tracker.agentRead(file);
            tracker.somebodyElseChanges('changed', file);
            return tracker.getChangedFiles(SESSION);
        }

        it('names a file by the root it is in', async () => {
            expect(await nameOf(new URI('file:///elsewhere/lib/b.ts'), new URI('file:///elsewhere/lib'))).to.deep.equal(['lib/b.ts']);
        });

        it('names a file by its root when that root is listed twice', async () => {
            expect(await nameOf(FILE, ROOT)).to.deep.equal([FILE_LABEL]);
        });

        it('names a file by uri when two roots share the name it would use', async () => {
            expect(await nameOf(FILE, new URI('file:///elsewhere/workspace'))).to.deep.equal([FILE.toString()]);
        });

        it('names a file by uri when it is outside every root', async () => {
            expect(await nameOf(new URI('file:///etc/hosts'))).to.deep.equal(['file:///etc/hosts']);
        });
    });

    it('evicts the least recently recorded file beyond the per-session limit', async () => {
        const tracker = new TestFileReadTracker();
        const files = ['a', 'b', 'c'].map(name => new URI(`file:///workspace/${name}.ts`));
        for (const uri of files) {
            tracker.contents.set(uri.toString(), 'original');
            await tracker.agentRead(uri);
        }

        files.forEach(uri => tracker.somebodyElseChanges('changed', uri));

        expect(await tracker.getChangedFiles(SESSION)).to.deep.equal(['workspace/b.ts', 'workspace/c.ts']);
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

        expect(await tracker.getChangedFiles(SESSION)).to.deep.equal(['workspace/a.ts']);
    });
});
