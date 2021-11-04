/********************************************************************************
 * Copyright (C) 2021 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { FileFilter, LabelProvider, PickResourceOptions, QuickInputService, QuickPickItem, QuickPickResourceService } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { nls, Path } from '@theia/core';

export interface FileQuickPickItem extends QuickPickItem {
    uri: URI;
    isFolder: boolean;
}

@injectable()
export class MonacoQuickPickResourceService implements QuickPickResourceService {

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(EnvVariablesServer)
    protected readonly environments: EnvVariablesServer;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    async save(options: PickResourceOptions = {}): Promise<URI | undefined> {
        options.canSelectFiles = true;
        options.canSelectFolders = true;
        return this.pick(options, true);
    }

    async open(options?: PickResourceOptions): Promise<URI | undefined> {
        return this.pick(options);
    }

    protected async pick(options?: PickResourceOptions, save = false): Promise<URI | undefined> {
        const allowFolderSelection = !!options?.canSelectFolders;
        const allowFileSelection = !!options?.canSelectFiles;
        const homedir = await this.environments.getHomeDirUri();
        let startUri: URI = options?.defaultUri ? options.defaultUri : new URI(homedir);
        let stat: FileStat | undefined;
        if (options?.defaultUri) {
            try {
                stat = await this.fileService.resolve(options.defaultUri);
            } catch {
                // The file or folder doesn't exist
            }
            if (!stat || (!stat.isDirectory && !allowFileSelection)) {
                startUri = options.defaultUri.withPath(options.defaultUri.path.dir);
            }
        }

        let currentPath = stat && stat.isFile ? startUri.path : this.addTrailingSeparator(startUri.path);
        let lastParent = currentPath;

        return new Promise(resolve => {
            const pickBox = this.quickInputService.createQuickPick<FileQuickPickItem>();
            pickBox.matchOnLabel = false;
            pickBox.sortByLabel = false;
            pickBox.autoFocusOnList = false;
            pickBox.ignoreFocusOut = false;
            pickBox.ok = true;
            pickBox.title = options && options.title;
            pickBox.value = currentPath.toString();
            pickBox.valueSelection = [pickBox.value.length, pickBox.value.length];
            pickBox.items = [];

            const doResolve = (uri: URI | undefined) => {
                resolve(uri);
                pickBox.dispose();
            };

            const handleAccept = async () => {
                if (pickBox.selectedItems.length === 1) {
                    const item = pickBox.selectedItems[0];
                    if (item.isFolder) {
                        const value = item.uri.path.toString();
                        pickBox.value = value;
                        currentPath = new Path(value);
                        updateItems(currentPath);
                    } else if (allowFileSelection) {
                        doResolve(item.uri);
                    }
                } else {
                    const target = startUri.withPath(currentPath);
                    if (!await this.fileService.exists(target) && save && currentPath.base.length > 0) {
                        doResolve(target);
                    }
                    try {
                        const fileStat = await this.fileService.resolve(target);
                        if (fileStat.isDirectory && allowFolderSelection) {
                            doResolve(this.trimTrailingSeparator(target));
                        } else if (fileStat.isFile && allowFileSelection) {
                            doResolve(target);
                        }
                    } catch {
                        pickBox.validationMessage = nls.localize('vscode/simpleFileDialog/remoteFileDialog.validateNonexistentDir', 'Please enter a path that exists.');
                    }
                }
            };

            const handleValueChange = async (value: string) => {
                pickBox.validationMessage = undefined;
                if (value === '~') {
                    value = new URI(homedir).path.toString();
                    pickBox.value = value;
                }
                currentPath = new Path(value);
                // Special handling for `..`
                if (currentPath.base === '..') {
                    currentPath = this.addTrailingSeparator(currentPath.dir.dir);
                    value = currentPath.toString();
                    pickBox.value = value;
                }
                await updateItems(currentPath);
                selectItem(value);
            };

            const selectItem = (value: string) => {
                const name = new Path(value).base;
                pickBox.activeItems = [];
                if (name.length > 0) {
                    for (const item of pickBox.items) {
                        if (QuickPickItem.is(item) && item.label && item.label.startsWith(name)) {
                            pickBox.activeItems = [item];
                            break;
                        }
                    }
                }
            };

            const updateItems = async (path: Path) => {
                const dir = path.dir;
                const currentUri = startUri.withPath(dir);
                // Don't update if the previous and the current path have the same parent
                if (dir.isEqual(lastParent)) {
                    return;
                }
                lastParent = dir;
                try {
                    const currentStat = await this.fileService.resolve(currentUri);
                    if (currentStat && currentStat.isDirectory) {
                        const items = await this.createItems(currentUri, allowFileSelection, options?.filters);
                        pickBox.items = items;
                    }
                } catch {
                    // Ignore errors that occur during file resolving
                }
            };

            pickBox.onDidAccept(_ => {
                handleAccept();
            });

            pickBox.onDidChangeValue(value => handleValueChange(value));
            pickBox.onDidHide(() => {
                doResolve(undefined);
            });

            updateItems(currentPath).then(() => {
                selectItem(pickBox.value);
                pickBox.show();
            });

            pickBox.valueSelection = this.getFilenameSelection(currentPath) ?? [pickBox.value.length, pickBox.value.length];
        });
    }

    protected getFilenameSelection(path: Path): [number, number] | undefined {
        const base = path.base;
        const ext = path.ext;
        if (ext) {
            const raw = path.toString();
            const index = raw.lastIndexOf(base);
            return [index, index + base.length - ext.length];
        }
        return undefined;
    }

    protected async createItems(currentFolder: URI, allowFileSelection: boolean, filters?: FileFilter): Promise<FileQuickPickItem[]> {
        const backDir = await this.createBackItem(currentFolder);
        let folder: FileStat;
        const result: FileQuickPickItem[] = [];
        try {
            folder = await this.fileService.resolve(currentFolder);
            const items = folder.children ? folder.children.map(child => this.createItem(child, currentFolder, allowFileSelection, filters)) : [];
            for (const item of items) {
                if (item) {
                    result.push(item);
                }
            }
        } catch (e) {
            console.error(e);
        }
        const sorted = result.sort((a, b) => {
            if (a.isFolder !== b.isFolder) {
                return a.isFolder ? -1 : 1;
            }
            return a.label.localeCompare(b.label);
        });

        if (backDir) {
            sorted.unshift(backDir);
        }
        return sorted;
    }

    protected createItem(stat: FileStat, parent: URI, allowFileSelection: boolean, filters?: FileFilter):
        FileQuickPickItem | undefined {
        const fullPath = parent.path.join(stat.name);
        const fullUri = parent.withPath(fullPath);
        if (stat.isDirectory) {
            return {
                label: stat.name,
                uri: this.addTrailingUriSeparator(fullUri),
                isFolder: true,
                iconClasses: [this.labelProvider.getIcon(stat)]
            };
        } else if (!stat.isDirectory && allowFileSelection && this.validExtension(stat, filters)) {
            return {
                label: stat.name,
                uri: this.trimTrailingSeparator(fullUri),
                isFolder: false,
                iconClasses: [this.labelProvider.getIcon(stat)]
            };
        }
        return undefined;
    }

    protected async createBackItem(currentFolder: URI): Promise<FileQuickPickItem | undefined> {
        const parent = currentFolder.path.dir;
        if (!currentFolder.path.isEqual(parent)) {
            const parentUri = currentFolder.withPath(parent);
            if (await this.fileService.exists(parentUri)) {
                return { label: '..', uri: this.addTrailingUriSeparator(parentUri), isFolder: true };
            }
        }
        return undefined;
    }

    protected validExtension(stat: FileStat, filters?: FileFilter): boolean {
        if (!filters) {
            return true;
        }
        // Trim the leading dot
        const ext = stat.resource.path.ext.substring(1);
        if (ext) {
            for (const extensions of Object.values(filters)) {
                if (extensions.includes(ext)) {
                    return true;
                }
            }
        }
        return false;
    }

    protected trimTrailingSeparator(uri: URI): URI {
        let raw = uri.path.toString();
        if (raw.endsWith('/')) {
            raw = raw.substring(0, raw.length - 1);
        }
        return uri.withPath(raw);
    }

    protected addTrailingSeparator(path: Path): Path {
        let raw = path.toString();
        if (!raw.endsWith('/')) {
            raw += '/';
        }
        return new Path(raw);
    }

    protected addTrailingUriSeparator(uri: URI): URI {
        return uri.withPath(this.addTrailingSeparator(uri.path));
    }
}
