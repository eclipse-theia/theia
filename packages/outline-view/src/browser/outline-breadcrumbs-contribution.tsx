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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { LabelProvider, BreadcrumbsService, Widget, TreeNode, OpenerService, open, SelectableTreeNode, BreadcrumbsContribution, Breadcrumb } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { OutlineViewService } from './outline-view-service';
import { OutlineSymbolInformationNode, OutlineViewWidget } from './outline-view-widget';
import { Disposable, DisposableCollection, Emitter, Event, UriSelection } from '@theia/core/lib/common';

export const OutlineBreadcrumbType = Symbol('OutlineBreadcrumb');
export const BreadcrumbPopupOutlineViewFactory = Symbol('BreadcrumbPopupOutlineViewFactory');
export const OUTLINE_BREADCRUMB_CONTAINER_CLASS = 'outline-element';
export interface BreadcrumbPopupOutlineViewFactory {
    (): BreadcrumbPopupOutlineView;
}
export class BreadcrumbPopupOutlineView extends OutlineViewWidget {
    @inject(OpenerService) protected readonly openerService: OpenerService;

    @inject(OutlineViewService)
    protected readonly outlineViewService: OutlineViewService;

    protected override tapNode(node?: TreeNode): void {
        if (UriSelection.is(node) && OutlineSymbolInformationNode.hasRange(node)) {
            open(this.openerService, node.uri, { selection: node.range });
        } else {
            this.outlineViewService.didTapNode(node as OutlineSymbolInformationNode);
            super.tapNode(node);
        }
    }

    cloneState(roots: OutlineSymbolInformationNode[]): void {
        const nodes = this.reconcileTreeState(roots);
        const root = this.getRoot(nodes);
        this.model.root = this.inflateFromStorage(this.deflateForStorage(root));
    }
}

@injectable()
export class OutlineBreadcrumbsContribution implements BreadcrumbsContribution {
    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(OutlineViewService)
    protected readonly outlineViewService: OutlineViewService;

    @inject(BreadcrumbsService)
    protected readonly breadcrumbsService: BreadcrumbsService;

    @inject(BreadcrumbPopupOutlineViewFactory)
    protected readonly outlineFactory: BreadcrumbPopupOutlineViewFactory;

    protected outlineView: BreadcrumbPopupOutlineView;

    readonly type = OutlineBreadcrumbType;
    readonly priority: number = 200;

    protected currentUri: URI | undefined = undefined;
    protected currentBreadcrumbs: OutlineBreadcrumb[] = [];
    protected roots: OutlineSymbolInformationNode[] = [];

    protected readonly onDidChangeBreadcrumbsEmitter = new Emitter<URI>();
    get onDidChangeBreadcrumbs(): Event<URI> {
        return this.onDidChangeBreadcrumbsEmitter.event;
    }

    @postConstruct()
    init(): void {
        this.outlineView = this.outlineFactory();
        this.outlineView.node.style.height = 'auto';
        this.outlineView.node.style.maxHeight = '200px';
        this.outlineViewService.onDidChangeOutline(roots => {
            if (roots.length > 0) {
                this.roots = roots;
                const first = roots[0];
                if (UriSelection.is(first)) {
                    this.updateOutlineItems(first.uri, this.findSelectedNode(roots));
                }
            } else {
                this.currentBreadcrumbs = [];
                this.roots = [];
            }
        });
        this.outlineViewService.onDidSelect(node => {
            if (UriSelection.is(node)) {
                this.updateOutlineItems(node.uri, node);
            }
        });
    }

    protected async updateOutlineItems(uri: URI, selectedNode: OutlineSymbolInformationNode | undefined): Promise<void> {
        this.currentUri = uri;
        const outlinePath = this.toOutlinePath(selectedNode);
        if (outlinePath && selectedNode) {
            this.currentBreadcrumbs = outlinePath.map((node, index) =>
                new OutlineBreadcrumb(
                    node,
                    uri,
                    index.toString(),
                    this.labelProvider.getName(node),
                    'symbol-icon-center codicon codicon-symbol-' + node.iconClass,
                    OUTLINE_BREADCRUMB_CONTAINER_CLASS,
                )
            );
            if (selectedNode.children && selectedNode.children.length > 0) {
                this.currentBreadcrumbs.push(new OutlineBreadcrumb(
                    selectedNode.children as OutlineSymbolInformationNode[],
                    uri,
                    this.currentBreadcrumbs.length.toString(),
                    '…',
                    '',
                    OUTLINE_BREADCRUMB_CONTAINER_CLASS,
                ));
            }
        } else {
            this.currentBreadcrumbs = [];
            if (this.roots) {
                this.currentBreadcrumbs.push(new OutlineBreadcrumb(
                    this.roots,
                    uri,
                    this.currentBreadcrumbs.length.toString(),
                    '…',
                    '',
                    OUTLINE_BREADCRUMB_CONTAINER_CLASS
                ));
            }
        }
        this.onDidChangeBreadcrumbsEmitter.fire(uri);
    }

    async computeBreadcrumbs(uri: URI): Promise<Breadcrumb[]> {
        if (this.currentUri && uri.toString() === this.currentUri.toString()) {
            return this.currentBreadcrumbs;
        }
        return [];
    }

    async attachPopupContent(breadcrumb: Breadcrumb, parent: HTMLElement): Promise<Disposable | undefined> {
        if (!OutlineBreadcrumb.is(breadcrumb)) {
            return undefined;
        }
        const node = Array.isArray(breadcrumb.node) ? breadcrumb.node[0] : breadcrumb.node;
        if (!node.parent) {
            return undefined;
        }
        const siblings = node.parent.children.filter((child): child is OutlineSymbolInformationNode => OutlineSymbolInformationNode.is(child));

        const toDisposeOnHide = new DisposableCollection();
        this.outlineView.cloneState(siblings);
        this.outlineView.model.selectNode(node);
        this.outlineView.model.collapseAll();
        Widget.attach(this.outlineView, parent);
        this.outlineView.activate();
        toDisposeOnHide.pushAll([
            this.outlineView.model.onExpansionChanged(expandedNode => SelectableTreeNode.is(expandedNode) && this.outlineView.model.selectNode(expandedNode)),
            Disposable.create(() => {
                this.outlineView.model.root = undefined;
                Widget.detach(this.outlineView);
            }),
        ]);
        return toDisposeOnHide;
    }

    /**
     * Returns the path of the given outline node.
     */
    protected toOutlinePath(node: OutlineSymbolInformationNode | undefined, path: OutlineSymbolInformationNode[] = []): OutlineSymbolInformationNode[] | undefined {
        if (!node) { return undefined; }
        if (node.id === 'outline-view-root') { return path; }
        if (node.parent) {
            return this.toOutlinePath(node.parent as OutlineSymbolInformationNode, [node, ...path]);
        } else {
            return [node, ...path];
        }
    }

    /**
     * Find the node that is selected. Returns after the first match.
     */
    protected findSelectedNode(roots: OutlineSymbolInformationNode[]): OutlineSymbolInformationNode | undefined {
        const result = roots.find(node => node.selected);
        if (result) {
            return result;
        }
        for (const node of roots) {
            const result2 = this.findSelectedNode(node.children.map(child => child as OutlineSymbolInformationNode));
            if (result2) {
                return result2;
            }
        }
    }
}

export class OutlineBreadcrumb implements Breadcrumb {
    constructor(
        readonly node: OutlineSymbolInformationNode | OutlineSymbolInformationNode[],
        readonly uri: URI,
        readonly index: string,
        readonly label: string,
        readonly iconClass: string,
        readonly containerClass: string,
    ) { }

    get id(): string {
        return this.type.toString() + '_' + this.uri.toString() + '_' + this.index;
    }

    get type(): symbol {
        return OutlineBreadcrumbType;
    }

    get longLabel(): string {
        return this.label;
    }
}
export namespace OutlineBreadcrumb {
    export function is(breadcrumb: Breadcrumb): breadcrumb is OutlineBreadcrumb {
        return 'node' in breadcrumb && 'uri' in breadcrumb;
    }
}
