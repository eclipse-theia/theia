// *****************************************************************************
// Copyright (C) 2020 EclipseSource and others.
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

import {
    ContextMenuRenderer,
    NodeProps,
    TreeModel,
    TreeNode,
    TreeProps,
    TreeWidget
} from '@theia/core/lib/browser';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { PropertyDataService } from '../property-data-service';
import { PropertyViewContentWidget } from '../property-view-content-widget';
import {
    ResourcePropertiesCategoryNode,
    ResourcePropertiesItemNode,
    ResourcePropertiesRoot,
    ROOT_ID
} from './resource-property-view-tree-items';
import { nls } from '@theia/core/lib/common/nls';

/**
 * This widget fetches the property data for {@link FileSelection}s and selections of {@link Navigatable}s
 * and renders that property data as a {@link TreeWidget}.
 * This widget is provided by the registered `ResourcePropertyViewWidgetProvider`.
 */
@injectable()
export class ResourcePropertyViewTreeWidget extends TreeWidget implements PropertyViewContentWidget {

    static readonly ID = 'resource-properties-tree-widget';
    static readonly LABEL = 'Resource Properties Tree';

    protected propertiesTree: Map<string, ResourcePropertiesCategoryNode>;
    protected currentSelection: Object | undefined;

    constructor(
        @inject(TreeProps) props: TreeProps,
        @inject(TreeModel) model: TreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);

        model.root = {
            id: ROOT_ID,
            name: ResourcePropertyViewTreeWidget.LABEL,
            parent: undefined,
            visible: false,
            children: []
        } as ResourcePropertiesRoot;

        this.propertiesTree = new Map<string, ResourcePropertiesCategoryNode>();
    }

    @postConstruct()
    protected override init(): void {
        super.init();

        this.id = ResourcePropertyViewTreeWidget.ID + '-treeContainer';
        this.addClass('treeContainer');

        this.fillPropertiesTree();
    }

    protected updateNeeded(selection: Object | undefined): boolean {
        return this.currentSelection !== selection;
    }

    updatePropertyViewContent(propertyDataService?: PropertyDataService, selection?: Object | undefined): void {
        if (this.updateNeeded(selection)) {
            this.currentSelection = selection;
            if (propertyDataService) {
                propertyDataService.providePropertyData(selection).then((fileStatObject?: FileStat) => {
                    this.fillPropertiesTree(fileStatObject);
                });
            }
        }
    }

    protected fillPropertiesTree(fileStatObject?: FileStat): void {
        if (fileStatObject) {
            this.propertiesTree.clear();
            const infoNode = this.createCategoryNode('info', nls.localizeByDefault('Info'));
            this.propertiesTree.set('info', infoNode);

            infoNode.children.push(this.createResultLineNode('isDirectory', nls.localize('theia/property-view/directory', 'Directory'), fileStatObject.isDirectory, infoNode));
            infoNode.children.push(this.createResultLineNode('isFile', nls.localizeByDefault('File'), fileStatObject.isFile, infoNode));
            infoNode.children.push(this.createResultLineNode('isSymbolicLink', nls.localize('theia/property-view/symbolicLink', 'Symbolic link'),
                fileStatObject.isSymbolicLink, infoNode));
            infoNode.children.push(this.createResultLineNode('location', nls.localize('theia/property-view/location', 'Location'),
                this.getLocationString(fileStatObject), infoNode));
            infoNode.children.push(this.createResultLineNode('name', nls.localizeByDefault('Name'), this.getFileName(fileStatObject), infoNode));
            infoNode.children.push(this.createResultLineNode('path', nls.localizeByDefault('Path'), this.getFilePath(fileStatObject), infoNode));
            infoNode.children.push(this.createResultLineNode('lastModification', nls.localize('theia/property-view/lastModified', 'Last modified'),
                this.getLastModificationString(fileStatObject), infoNode));
            infoNode.children.push(this.createResultLineNode('created', nls.localize('theia/property-view/created', 'Created'),
                this.getCreationTimeString(fileStatObject), infoNode));
            infoNode.children.push(this.createResultLineNode('size', nls.localize('theia/property-view/size', 'Size'), this.getSizeString(fileStatObject), infoNode));
            this.refreshModelChildren();
        }
    }

    protected getLocationString(fileStat: FileStat): string {
        return fileStat.resource.path.fsPath();
    }

    protected getFileName(fileStat: FileStat): string {
        return this.labelProvider.getName(fileStat.resource);
    }

    protected getFilePath(fileStat: FileStat): string {
        return this.labelProvider.getLongName(fileStat.resource);
    }

    protected getLastModificationString(fileStat: FileStat): string {
        return fileStat.mtime ? new Date(fileStat.mtime).toLocaleString() : '';
    }

    protected getCreationTimeString(fileStat: FileStat): string {
        return fileStat.ctime ? new Date(fileStat.ctime).toLocaleString() : '';
    }

    protected getSizeString(fileStat: FileStat): string {
        return fileStat.size ? nls.localizeByDefault('{0}B', fileStat.size.toString()) : '';
    }

    /*
    * Creating TreeNodes
    */

    protected createCategoryNode(categoryId: string, name: string): ResourcePropertiesCategoryNode {
        return {
            id: categoryId,
            parent: this.model.root as ResourcePropertiesRoot,
            name,
            children: [],
            categoryId,
            selected: false,
            expanded: true
        };
    }

    protected createResultLineNode(id: string, name: string, property: boolean | string | undefined, parent: ResourcePropertiesCategoryNode): ResourcePropertiesItemNode {
        return {
            id: `${parent.id}::${id}`,
            parent,
            name: name,
            property: property !== undefined ? String(property) : '',
            selected: false
        };
    }

    /**
     * Rendering
     */

    protected async refreshModelChildren(): Promise<void> {
        if (ResourcePropertiesRoot.is(this.model.root)) {
            this.model.root.children = Array.from(this.propertiesTree.values());
            this.model.refresh();
        }
    }

    protected override renderCaption(node: TreeNode, props: NodeProps): React.ReactNode {
        if (ResourcePropertiesCategoryNode.is(node)) {
            return this.renderExpandableNode(node);
        } else if (ResourcePropertiesItemNode.is(node)) {
            return this.renderItemNode(node);
        }
        return undefined;
    }

    protected renderExpandableNode(node: ResourcePropertiesCategoryNode): React.ReactNode {
        return <React.Fragment>
            <div className={`theia-resource-tree-node-icon ${this.toNodeIcon(node)}`}></div>
            <div className={'theia-resource-tree-node-name theia-TreeNodeSegment theia-TreeNodeSegmentGrow'}>{this.toNodeName(node)}</div>
        </React.Fragment>;
    }

    protected renderItemNode(node: ResourcePropertiesItemNode): React.ReactNode {
        return <React.Fragment>
            <div className={`theia-resource-tree-node-icon ${this.toNodeIcon(node)}`}></div>
            <div className={'theia-resource-tree-node-name theia-TreeNodeSegment theia-TreeNodeSegmentGrow'}>{this.toNodeName(node)}</div>
            <div className={'theia-resource-tree-node-property theia-TreeNodeSegment theia-TreeNodeSegmentGrow'}>{this.toNodeDescription(node)}</div>
        </React.Fragment>;
    }

    protected override createNodeAttributes(node: TreeNode, props: NodeProps): React.Attributes & React.HTMLAttributes<HTMLElement> {
        return {
            ...super.createNodeAttributes(node, props),
            title: this.getNodeTooltip(node)
        };
    }

    protected getNodeTooltip(node: TreeNode): string | undefined {
        if (ResourcePropertiesCategoryNode.is(node)) {
            return this.labelProvider.getName(node);
        } else if (ResourcePropertiesItemNode.is(node)) {
            return `${this.labelProvider.getName(node)}: ${this.labelProvider.getLongName(node)}`;
        }
        return undefined;
    }

}
