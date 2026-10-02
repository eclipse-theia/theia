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

// TypeScript's `lib.dom` only covers the parts of the File System Access API that all browsers ship.
// The Chromium-only parts are declared here as local types rather than global augmentations,
// so that they don't leak into adopters' typings.

export type FileSystemAccessPermissionState = 'granted' | 'denied' | 'prompt';

export interface FileSystemAccessPermissionDescriptor {
    mode?: 'read' | 'readwrite';
}

/**
 * A `FileSystemHandle` including the permission and move methods that are only available in Chromium.
 */
export interface FileSystemAccessHandle extends FileSystemHandle {
    queryPermission?(descriptor?: FileSystemAccessPermissionDescriptor): Promise<FileSystemAccessPermissionState>;
    requestPermission?(descriptor?: FileSystemAccessPermissionDescriptor): Promise<FileSystemAccessPermissionState>;
    move?(destination: FileSystemDirectoryHandle, newName: string): Promise<void>;
}

export interface DirectoryPickerOptions {
    id?: string;
    mode?: 'read' | 'readwrite';
}

export interface FileSystemObserverRecord {
    root: FileSystemHandle;
    changedHandle: FileSystemHandle | null;
    relativePathComponents: string[];
    relativePathMovedFrom?: string[];
    type: 'appeared' | 'disappeared' | 'modified' | 'moved' | 'unknown' | 'errored';
}

export interface FileSystemObserver {
    observe(handle: FileSystemHandle, options?: { recursive?: boolean }): Promise<void>;
    disconnect(): void;
}

export interface FileSystemObserverConstructor {
    new(callback: (records: FileSystemObserverRecord[], observer: FileSystemObserver) => void): FileSystemObserver;
}

export interface WindowWithFileSystemAccess {
    showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
    FileSystemObserver?: FileSystemObserverConstructor;
}
