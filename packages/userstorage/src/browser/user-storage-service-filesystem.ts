/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { DisposableCollection, ILogger, Emitter, Event } from '@theia/core/lib/common';
import { UserStorageChangeEvent, UserStorageService } from './user-storage-service';
import { injectable, inject } from 'inversify';
import { FileChange, FileSystemWatcher } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { FileSystem } from "@theia/filesystem/lib/common";
import URI from '@theia/core/lib/common/uri';
import { UserStorageUri } from './user-storage-uri';

const THEIA_USER_STORAGE_FOLDER = '.theia';

@injectable()
export class UserStorageServiceFilesystemImpl implements UserStorageService {

    protected readonly toDispose = new DisposableCollection();
    protected readonly onUserStorageChangedEmitter = new Emitter<UserStorageChangeEvent>();
    protected readonly userStorageFolder: Promise<URI>;

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcher) protected readonly watcher: FileSystemWatcher,
        @inject(ILogger) protected readonly logger: ILogger

    ) {
        this.userStorageFolder = this.fileSystem.getCurrentUserHome().then(home => {

            const userStorageFolderUri = new URI(home.uri).resolve(THEIA_USER_STORAGE_FOLDER);
            watcher.watchFileChanges(userStorageFolderUri).then(disposable =>
                this.toDispose.push(disposable)
            );
            this.toDispose.push(this.watcher.onFilesChanged(changes => this.onDidFilesChanged(changes)));
            return new URI(home.uri).resolve(THEIA_USER_STORAGE_FOLDER);
        });

        this.toDispose.push(this.onUserStorageChangedEmitter);

    }

    dispose(): void {
        this.toDispose.dispose();
    }

    onDidFilesChanged(fileChanges: FileChange[]): void {
        const uris: URI[] = [];
        this.userStorageFolder.then(folder => {
            for (const change of fileChanges) {
                const userStorageUri = UserStorageServiceFilesystemImpl.toUserStorageUri(folder, change.uri);
                uris.push(userStorageUri);
            }
            this.onUserStorageChangedEmitter.fire({ uris });
        });
    }

    async readContents(uri: URI) {
        const folderUri = await this.userStorageFolder;
        const filesystemUri = UserStorageServiceFilesystemImpl.toFilesystemURI(folderUri, uri);
        const exists = await this.fileSystem.exists(filesystemUri.toString());

        if (exists) {
            return this.fileSystem.resolveContent(filesystemUri.toString()).then(({ stat, content }) => content);
        }

        return "";
    }

    async saveContents(uri: URI, content: string) {
        const folderUri = await this.userStorageFolder;
        const filesystemUri = UserStorageServiceFilesystemImpl.toFilesystemURI(folderUri, uri);
        const exists = await this.fileSystem.exists(filesystemUri.toString());

        if (exists) {
            this.fileSystem.getFileStat(filesystemUri.toString()).then(fileStat => {
                this.fileSystem.setContent(fileStat, content).then(() => Promise.resolve());
            });
        } else {
            this.fileSystem.createFile(filesystemUri.toString(), { content });
        }
    }

    get onUserStorageChanged(): Event<UserStorageChangeEvent> {
        return this.onUserStorageChangedEmitter.event;
    }

    /**
     * Creates a new user storage URI from the filesystem URI.
     * @param userStorageFolderUri User storage folder URI
     * @param fsPath The filesystem URI
     */
    public static toUserStorageUri(userStorageFolderUri: URI, rawUri: URI): URI {
        const userStorageRelativePath = this.getRelativeUserStoragePath(userStorageFolderUri, rawUri);
        return new URI('').withScheme(UserStorageUri.SCHEME).withPath(userStorageRelativePath).withFragment(rawUri.fragment).withQuery(rawUri.query);
    }

    /**
     * Returns the path relative to the user storage filesystem uri i.e if the user storage root is
     * 'file://home/user/.theia' and the fileUri is 'file://home/user.theia/keymaps.json' it will return 'keymaps.json'
     * @param userStorageFolderUri User storage folder URI
     * @param fileUri User storage
     */
    private static getRelativeUserStoragePath(userStorageFolderUri: URI, fileUri: URI): string {
        /* + 1 so that it removes the beginning slash  i.e return keymaps.json and not /keymaps.json */
        return fileUri.toString().slice(userStorageFolderUri.toString().length + 1);
    }

    /**
     * Returns the associated filesystem URI relative to the user storage folder passed as argument.
     * @param userStorageFolderUri User storage folder URI
     * @param userStorageUri User storage URI to be converted in filesystem URI
     */
    public static toFilesystemURI(userStorageFolderUri: URI, userStorageUri: URI): URI {
        return userStorageFolderUri.withPath(userStorageFolderUri.path.join(userStorageUri.path.toString()));
    }
}
