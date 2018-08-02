/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { InputBoxOptions } from '@theia/plugin';
import { interfaces } from 'inversify';
import { QuickOpenModel, QuickOpenItem, QuickOpenMode } from '@theia/core/lib/browser/quick-open/quick-open-model';
import { RPCProtocol } from '../../api/rpc-protocol';
import { QuickOpenExt, QuickOpenMain, MAIN_RPC_CONTEXT, PickOptions, PickOpenItem, OpenDialogOptionsMain } from '../../api/plugin-api';
import { MonacoQuickOpenService } from '@theia/monaco/lib/browser/monaco-quick-open-service';
import { QuickInputService } from '@theia/monaco/lib/browser/monaco-quick-input-service';
import URI from '@theia/core/lib/common/uri';
import { DirNode, FileDialogProps, FileDialogFactory } from '@theia/filesystem/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileSystem } from '@theia/filesystem/lib/common';
import { LabelProvider } from '@theia/core/lib/browser';
import { UriSelection } from '@theia/core/lib/common/selection';

export class QuickOpenMainImpl implements QuickOpenMain, QuickOpenModel {

    private quickInput: QuickInputService;
    private doResolve: (value?: number | number[] | PromiseLike<number | number[]> | undefined) => void;
    private proxy: QuickOpenExt;
    private delegate: MonacoQuickOpenService;
    private acceptor: ((items: QuickOpenItem[]) => void) | undefined;
    private items: QuickOpenItem[] | undefined;

    private workspaceService: WorkspaceService;
    private fileSystem: FileSystem;
    private labelProvider: LabelProvider;
    private fileDialogFactory: FileDialogFactory;

    private activeElement: HTMLElement | undefined;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.QUICK_OPEN_EXT);
        this.delegate = container.get(MonacoQuickOpenService);
        this.quickInput = container.get(QuickInputService);
        this.workspaceService = container.get(WorkspaceService);
        this.fileSystem = container.get(FileSystem);
        this.labelProvider = container.get(LabelProvider);
        this.fileDialogFactory = container.get(FileDialogFactory);
    }

    private cleanUp() {
        this.items = undefined;
        this.acceptor = undefined;
        if (this.activeElement) {
            this.activeElement.focus();
        }
        this.activeElement = undefined;
    }

    $show(options: PickOptions): Promise<number | number[]> {
        this.activeElement = window.document.activeElement as HTMLElement;
        this.delegate.open(this, {
            fuzzyMatchDescription: options.matchOnDescription,
            fuzzyMatchLabel: true,
            fuzzyMatchDetail: options.matchOnDetail,
            placeholder: options.placeHolder,
            onClose: () => {
                this.cleanUp();
            }
        });

        return new Promise((resolve, reject) => {
            this.doResolve = resolve;
        });
    }

    // tslint:disable-next-line:no-any
    $setItems(items: PickOpenItem[]): Promise<any> {
        this.items = [];
        for (const i of items) {
            this.items.push(new QuickOpenItem({
                label: i.label,
                description: i.description,
                detail: i.detail,
                run: mode => {
                    if (mode === QuickOpenMode.PREVIEW) {
                        this.proxy.$onItemSelected(i.handle);
                    } else if (mode === QuickOpenMode.OPEN) {
                        this.doResolve(i.handle);
                        this.cleanUp();
                    }
                    return true;
                }
            }));
        }
        if (this.acceptor) {
            this.acceptor(this.items);
        }
        return Promise.resolve();
    }

    // tslint:disable-next-line:no-any
    $setError(error: Error): Promise<any> {
        throw new Error('Method not implemented.');
    }

    $input(options: InputBoxOptions, validateInput: boolean): Promise<string | undefined> {
        if (validateInput) {
            options.validateInput = val => this.proxy.$validateInput(val);
        }

        return this.quickInput.open(options);
    }

    async $showOpenDialog(options: OpenDialogOptionsMain): Promise<string[] | undefined> {
        let rootStat;

        // Try to use preconfigured default URI as root
        if (options.defaultUri) {
            rootStat = await this.fileSystem.getFileStat(options.defaultUri);
        }

        // Try to use workspace service root if there is no preconfigured URI
        if (!rootStat) {
            rootStat = await this.workspaceService.root;
        }

        // Try to use current user home if root folder is still not taken
        if (!rootStat) {
            rootStat = await this.fileSystem.getCurrentUserHome();
        }

        // Fail of root not fount
        if (!rootStat) {
            throw new Error('Unable to find the rootStat');
        }

        // Take the info for root node
        const rootUri = new URI(rootStat.uri);
        const name = this.labelProvider.getName(rootUri);
        const icon = await this.labelProvider.getIcon(rootUri);
        const rootNode = DirNode.createRoot(rootStat, name, icon);

        try {
            // Determine proper title for the dialog
            const canSelectFiles = typeof options.canSelectFiles === 'boolean' ? options.canSelectFiles : true;
            const canSelectFolders = typeof options.canSelectFolders === 'boolean' ? options.canSelectFolders : true;

            let title;
            if (canSelectFiles && canSelectFolders) {
                title = 'Open';
            } else {
                if (canSelectFiles) {
                    title = 'Open File';
                } else {
                    title = 'Open Folder';
                }

                if (options.canSelectMany) {
                    title += '(s)';
                }
            }

            // Create dialog props
            const dialogProps = {
                title: title,
                openLabel: options.openLabel,
                canSelectFiles: options.canSelectFiles,
                canSelectFolders: options.canSelectFolders,
                canSelectMany: options.canSelectMany,
                filters: options.filters
            } as FileDialogProps;

            // Open the dialog
            const dialog = this.fileDialogFactory(dialogProps);
            dialog.model.navigateTo(rootNode);
            const result = await dialog.open();

            // Return the result
            return UriSelection.getUris(result).map(uri => uri.path.toString());
        } catch (error) {
            console.log(error);
        }

        return undefined;
    }

    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
        this.acceptor = acceptor;
        if (this.items) {
            acceptor(this.items);
        }
    }
}
