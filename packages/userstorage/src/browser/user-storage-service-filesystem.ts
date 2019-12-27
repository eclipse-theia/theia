/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import { DisposableCollection, ILogger, Emitter, Event } from '@theia/core/lib/common';
import { UserStorageChangeEvent, UserStorageService } from './user-storage-service';
import { injectable, inject } from 'inversify';
import { FileSystemWatcher, FileChangeEvent } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileSystem } from '@theia/filesystem/lib/common';
import URI from '@theia/core/lib/common/uri';
import { UserStorageUri } from './user-storage-uri';

@injectable()
export class UserStorageServiceFilesystemImpl implements UserStorageService {

    protected readonly toDispose = new DisposableCollection();
    protected readonly onUserStorageChangedEmitter = new Emitter<UserStorageChangeEvent>();
    protected userStorageFolder: Promise<URI | undefined>;

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcher) protected readonly watcher: FileSystemWatcher,
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(EnvVariablesServer) protected readonly envServer: EnvVariablesServer
    ) {
        this.envServer.getDataFolderName().then(userStorageFolder => {
            this.userStorageFolder = this.fileSystem.getCurrentUserHome().then(home => {
                if (home) {
                    const userStorageFolderUri = new URI(home.uri).resolve(userStorageFolder);
                    watcher.watchFileChanges(userStorageFolderUri).then(disposable =>
                        this.toDispose.push(disposable)
                    );
                    this.toDispose.push(this.watcher.onFilesChanged(changes => this.onDidFilesChanged(changes)));
                    return new URI(home.uri).resolve(userStorageFolder);
                }
            });
        });

        this.toDispose.push(this.onUserStorageChangedEmitter);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected onDidFilesChanged(event: FileChangeEvent): void {
        const uris: URI[] = [];
        this.userStorageFolder.then(folder => {
            if (folder) {
                for (const change of event) {
                    if (folder.isEqualOrParent(change.uri)) {
                        const userStorageUri = UserStorageServiceFilesystemImpl.toUserStorageUri(folder, change.uri);
                        uris.push(userStorageUri);
                    }
                }
                if (uris.length > 0) {
                    this.onUserStorageChangedEmitter.fire({ uris });
                }
            }
        });
    }

    async readContents(uri: URI): Promise<string> {
        const folderUri = await this.userStorageFolder;
        if (folderUri) {
            const filesystemUri = UserStorageServiceFilesystemImpl.toFilesystemURI(folderUri, uri);
            const exists = await this.fileSystem.exists(filesystemUri.toString());

            if (exists) {
                return this.fileSystem.resolveContent(filesystemUri.toString()).then(({ stat, content }) => content);
            }
        }
        return '';
    }

    async saveContents(uri: URI, content: string): Promise<void> {
        const folderUri = await this.userStorageFolder;
        if (!folderUri) {
            return;
        }
        const filesystemUri = UserStorageServiceFilesystemImpl.toFilesystemURI(folderUri, uri);

        const fileStat = await this.fileSystem.getFileStat(filesystemUri.toString());
        if (fileStat) {
            this.fileSystem.setContent(fileStat, content).then(() => Promise.resolve());
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
