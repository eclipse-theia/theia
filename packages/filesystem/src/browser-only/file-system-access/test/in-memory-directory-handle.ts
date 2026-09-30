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

/* eslint-disable @typescript-eslint/no-explicit-any */

// A minimal in-memory stand-in for the File System Access API handles, so that the provider can be tested in Node.

function domError(name: string, message: string): Error {
    return new DOMException(message, name);
}

export class InMemoryFileHandle {
    readonly kind = 'file' as const;
    data: Uint8Array = new Uint8Array(0);
    lastModified = Date.now();

    constructor(public name: string) { }

    async isSameEntry(other: unknown): Promise<boolean> {
        return other === this;
    }

    async getFile(): Promise<{ name: string; size: number; lastModified: number; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> }> {
        const data = this.data.slice();
        return {
            name: this.name,
            size: data.byteLength,
            lastModified: this.lastModified,
            arrayBuffer: async () => data.buffer as ArrayBuffer,
            text: async () => new TextDecoder().decode(data)
        };
    }

    async createWritable(options?: { keepExistingData?: boolean }): Promise<InMemoryWritableFileStream> {
        return new InMemoryWritableFileStream(this, options?.keepExistingData ? this.data : new Uint8Array(0));
    }
}

export class InMemoryWritableFileStream {
    protected position = 0;
    protected closed = false;

    constructor(protected readonly file: InMemoryFileHandle, protected data: Uint8Array) { }

    async write(chunk: Uint8Array | ArrayBuffer | string | { type: string; data?: Uint8Array | ArrayBuffer | string; position?: number; size?: number }): Promise<void> {
        if (this.closed) {
            throw new TypeError('The stream is closed');
        }
        if (chunk instanceof Object && !(chunk instanceof Uint8Array) && !(chunk instanceof ArrayBuffer)) {
            if (chunk.type === 'seek') {
                this.position = chunk.position ?? 0;
            } else if (chunk.type === 'truncate') {
                await this.truncate(chunk.size ?? 0);
            } else {
                if (chunk.position !== undefined) {
                    this.position = chunk.position;
                }
                await this.write(chunk.data ?? new Uint8Array(0));
            }
            return;
        }
        const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk)
            : chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : chunk;
        const end = this.position + bytes.byteLength;
        if (end > this.data.byteLength) {
            const grown = new Uint8Array(end);
            grown.set(this.data);
            this.data = grown;
        }
        this.data.set(bytes, this.position);
        this.position = end;
    }

    async seek(position: number): Promise<void> {
        this.position = position;
    }

    async truncate(size: number): Promise<void> {
        const resized = new Uint8Array(size);
        resized.set(this.data.subarray(0, size));
        this.data = resized;
        this.position = Math.min(this.position, size);
    }

    async close(): Promise<void> {
        this.closed = true;
        this.file.data = this.data;
        this.file.lastModified = Date.now();
    }

    async abort(): Promise<void> {
        this.closed = true;
    }
}

export class InMemoryDirectoryHandle {
    readonly kind = 'directory' as const;
    readonly children = new Map<string, InMemoryDirectoryHandle | InMemoryFileHandle>();

    /** Set to enable the optional `move` method on the handles created in this tree. */
    constructor(public name: string = '', protected readonly supportsMove: boolean = false) {
        if (supportsMove) {
            (this as any).move = (destination: InMemoryDirectoryHandle, newName: string): Promise<void> => this.moveTo(destination, newName);
        }
    }

    parent: InMemoryDirectoryHandle | undefined;

    async isSameEntry(other: unknown): Promise<boolean> {
        return other === this;
    }

    async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<InMemoryDirectoryHandle> {
        const existing = this.children.get(name);
        if (existing) {
            if (existing.kind !== 'directory') {
                throw domError('TypeMismatchError', `${name} is a file`);
            }
            return existing;
        }
        if (!options?.create) {
            throw domError('NotFoundError', `${name} not found`);
        }
        const created = new InMemoryDirectoryHandle(name, this.supportsMove);
        created.parent = this;
        this.children.set(name, created);
        return created;
    }

    async getFileHandle(name: string, options?: { create?: boolean }): Promise<InMemoryFileHandle> {
        const existing = this.children.get(name);
        if (existing) {
            if (existing.kind !== 'file') {
                throw domError('TypeMismatchError', `${name} is a directory`);
            }
            return existing;
        }
        if (!options?.create) {
            throw domError('NotFoundError', `${name} not found`);
        }
        const created = new InMemoryFileHandle(name);
        if (this.supportsMove) {
            (created as any).move = (destination: InMemoryDirectoryHandle, newName: string): Promise<void> => this.moveChild(created, destination, newName);
        }
        this.children.set(name, created);
        return created;
    }

    async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
        const existing = this.children.get(name);
        if (!existing) {
            throw domError('NotFoundError', `${name} not found`);
        }
        if (existing.kind === 'directory' && existing.children.size > 0 && !options?.recursive) {
            throw domError('InvalidModificationError', `${name} is not empty`);
        }
        this.children.delete(name);
    }

    async * entries(): AsyncIterableIterator<[string, InMemoryDirectoryHandle | InMemoryFileHandle]> {
        yield* [...this.children.entries()];
    }

    async * keys(): AsyncIterableIterator<string> {
        yield* [...this.children.keys()];
    }

    async * values(): AsyncIterableIterator<InMemoryDirectoryHandle | InMemoryFileHandle> {
        yield* [...this.children.values()];
    }

    [Symbol.asyncIterator](): AsyncIterableIterator<[string, InMemoryDirectoryHandle | InMemoryFileHandle]> {
        return this.entries();
    }

    protected async moveTo(destination: InMemoryDirectoryHandle, newName: string): Promise<void> {
        if (!this.parent) {
            throw domError('NotAllowedError', 'The root cannot be moved');
        }
        await this.parent.moveChild(this, destination, newName);
    }

    protected async moveChild(child: InMemoryDirectoryHandle | InMemoryFileHandle, destination: InMemoryDirectoryHandle, newName: string): Promise<void> {
        this.children.delete(child.name);
        child.name = newName;
        if (child.kind === 'directory') {
            child.parent = destination;
        }
        destination.children.set(newName, child);
        // A file handle keeps moving relative to the directory that owns it now.
        if (child.kind === 'file' && destination.supportsMove) {
            (child as any).move = (next: InMemoryDirectoryHandle, name: string): Promise<void> => destination.moveChild(child, next, name);
        }
    }
}

/** Creates a directory handle usable where a `FileSystemDirectoryHandle` is expected. */
export function createInMemoryDirectoryHandle(options?: { supportsMove?: boolean }): FileSystemDirectoryHandle {
    return new InMemoryDirectoryHandle('root', options?.supportsMove ?? false) as unknown as FileSystemDirectoryHandle;
}

/** Adds a file, including missing parent directories, to an in-memory tree. */
export async function addInMemoryFile(root: FileSystemDirectoryHandle, path: string, content: string): Promise<void> {
    const segments = path.split('/').filter(segment => segment.length > 0);
    let directory = root;
    for (const segment of segments.slice(0, -1)) {
        directory = await directory.getDirectoryHandle(segment, { create: true });
    }
    const file = await directory.getFileHandle(segments[segments.length - 1], { create: true });
    const writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
}
