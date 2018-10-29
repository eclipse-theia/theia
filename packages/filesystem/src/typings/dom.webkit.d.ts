/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

type WebKitEntriesCallback = ((entries: WebKitEntry[]) => void) | { handleEvent(entries: WebKitEntry[]): void; };

type WebKitErrorCallback = ((err: DOMError) => void) | { handleEvent(err: DOMError): void; };

type WebKitFileCallback = ((file: File) => void) | { handleEvent(file: File): void; };

interface WebKitDirectoryEntry extends WebKitEntry {
    createReader(): WebKitDirectoryReader;
}

declare var WebKitDirectoryEntry: {
    prototype: WebKitDirectoryEntry;
    new(): WebKitDirectoryEntry;
};

interface WebKitDirectoryReader {
    readEntries(successCallback: WebKitEntriesCallback, errorCallback?: WebKitErrorCallback): void;
}

declare var WebKitDirectoryReader: {
    prototype: WebKitDirectoryReader;
    new(): WebKitDirectoryReader;
};

interface WebKitEntry {
    readonly filesystem: WebKitFileSystem;
    readonly fullPath: string;
    readonly isDirectory: boolean;
    readonly isFile: boolean;
    readonly name: string;
}

declare var WebKitEntry: {
    prototype: WebKitEntry;
    new(): WebKitEntry;
};

interface WebKitFileEntry extends WebKitEntry {
    file(successCallback: WebKitFileCallback, errorCallback?: WebKitErrorCallback): void;
}

declare var WebKitFileEntry: {
    prototype: WebKitFileEntry;
    new(): WebKitFileEntry;
};

interface WebKitFileSystem {
    readonly name: string;
    readonly root: WebKitDirectoryEntry;
}

declare var WebKitFileSystem: {
    prototype: WebKitFileSystem;
    new(): WebKitFileSystem;
};

declare interface DataTransferItem {
    webkitGetAsEntry(): WebKitEntry | null;
}
