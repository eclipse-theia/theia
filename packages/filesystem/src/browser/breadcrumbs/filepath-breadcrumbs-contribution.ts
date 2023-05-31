// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { Disposable, Emitter, Event } from '@theia/core';
import { injectable, inject } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { Breadcrumb, BreadcrumbsContribution, CompositeTreeNode, LabelProvider, SelectableTreeNode, Widget } from '@theia/core/lib/browser';
import { FilepathBreadcrumb } from './filepath-breadcrumb';
import { BreadcrumbsFileTreeWidget } from './filepath-breadcrumbs-container';
import { DirNode } from '../file-tree';
import { FileService } from '../file-service';
import { FileStat } from '../../common/files';

export const FilepathBreadcrumbType = Symbol('FilepathBreadcrumb');

export interface FilepathBreadcrumbClassNameFactory {
    (location: URI, index: number): string;
}

@injectable()
export class FilepathBreadcrumbsContribution implements BreadcrumbsContribution {

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(FileService)
    protected readonly fileSystem: FileService;

    @inject(BreadcrumbsFileTreeWidget)
    protected readonly breadcrumbsFileTreeWidget: BreadcrumbsFileTreeWidget;

    protected readonly onDidChangeBreadcrumbsEmitter = new Emitter<URI>();
    get onDidChangeBreadcrumbs(): Event<URI> {
        return this.onDidChangeBreadcrumbsEmitter.event;
    }

    readonly type = FilepathBreadcrumbType;
    readonly priority: number = 100;

    async computeBreadcrumbs(uri: URI): Promise<Breadcrumb[]> {
        if (uri.scheme !== 'file') {
            return [];
        }
        const getContainerClass = this.getContainerClassCreator(uri);
        const getIconClass = this.getIconClassCreator(uri);
        return uri.allLocations
            .map((location, index) => {
                const icon = getIconClass(location, index);
                const containerClass = getContainerClass(location, index);
                return new FilepathBreadcrumb(
                    location,
                    this.labelProvider.getName(location),
                    this.labelProvider.getLongName(location),
                    icon,
                    containerClass,
                );
            })
            .filter(b => this.filterBreadcrumbs(uri, b))
            .reverse();
    }

    protected getContainerClassCreator(fileURI: URI): FilepathBreadcrumbClassNameFactory {
        return (location, index) => location.isEqual(fileURI) ? 'file' : 'folder';
    }

    protected getIconClassCreator(fileURI: URI): FilepathBreadcrumbClassNameFactory {
        return (location, index) => location.isEqual(fileURI) ? this.labelProvider.getIcon(location) + ' file-icon' : '';
    }

    protected filterBreadcrumbs(_: URI, breadcrumb: FilepathBreadcrumb): boolean {
        return !breadcrumb.uri.path.isRoot;
    }

    async attachPopupContent(breadcrumb: Breadcrumb, parent: HTMLElement): Promise<Disposable | undefined> {
        if (!FilepathBreadcrumb.is(breadcrumb)) {
            return undefined;
        }
        const folderFileStat = await this.fileSystem.resolve(breadcrumb.uri.parent);
        if (folderFileStat) {
            const rootNode = await this.createRootNode(folderFileStat);
            if (rootNode) {
                const { model } = this.breadcrumbsFileTreeWidget;
                await model.navigateTo({ ...rootNode, visible: false });
                Widget.attach(this.breadcrumbsFileTreeWidget, parent);
                const toDisposeOnTreePopulated = model.onChanged(() => {
                    if (CompositeTreeNode.is(model.root) && model.root.children.length > 0) {
                        toDisposeOnTreePopulated.dispose();
                        const targetNode = model.getNode(breadcrumb.uri.path.toString());
                        if (targetNode && SelectableTreeNode.is(targetNode)) {
                            model.selectNode(targetNode);
                        }
                        this.breadcrumbsFileTreeWidget.activate();
                    }
                });
                return {
                    dispose: () => {
                        // Clear model otherwise the next time a popup is opened the old model is rendered first
                        // and is shown for a short time period.
                        toDisposeOnTreePopulated.dispose();
                        this.breadcrumbsFileTreeWidget.model.root = undefined;
                        Widget.detach(this.breadcrumbsFileTreeWidget);
                    }
                };
            }
        }
    }

    protected async createRootNode(folderToOpen: FileStat): Promise<DirNode | undefined> {
        const folderUri = folderToOpen.resource;
        const rootUri = folderToOpen.isDirectory ? folderUri : folderUri.parent;
        const rootStat = await this.fileSystem.resolve(rootUri);
        if (rootStat) {
            return DirNode.createRoot(rootStat);
        }
    }
}
