/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { ProblemManager } from './problem-manager';
import { ProblemMarker } from '../../common/problem-marker';
import { ProblemTreeModel } from './problem-tree-model';
import { MarkerInfoNode, MarkerNode, MarkerRootNode } from '../marker-tree';
import { TreeWidget, TreeProps, ContextMenuRenderer, TreeNode, NodeProps, TreeModel } from '@theia/core/lib/browser';
import { DiagnosticSeverity } from 'vscode-languageserver-types';
import * as React from 'react';

export const PROBLEMS_WIDGET_ID = 'problems';

@injectable()
export class ProblemWidget extends TreeWidget {

    constructor(
        @inject(ProblemManager) protected readonly problemManager: ProblemManager,
        @inject(TreeProps) readonly treeProps: TreeProps,
        @inject(ProblemTreeModel) readonly model: ProblemTreeModel,
        @inject(ContextMenuRenderer) readonly contextMenuRenderer: ContextMenuRenderer
    ) {
        super(treeProps, model, contextMenuRenderer);

        this.id = PROBLEMS_WIDGET_ID;
        this.title.label = 'Problems';
        this.title.caption = 'Problems';
        this.title.iconClass = 'fa problem-tab-icon';
        this.title.closable = true;
        this.addClass('theia-marker-container');

        this.addClipboardListener(this.node, 'copy', e => this.handleCopy(e));
    }

    storeState(): object {
        // no-op
        return {};
    }
    protected superStoreState(): object {
        return super.storeState();
    }
    restoreState(state: object): void {
        // no-op
    }
    protected superRestoreState(state: object): void {
        super.restoreState(state);
        return;
    }

    protected handleClickEvent(node: TreeNode | undefined, event: React.MouseEvent<HTMLElement>): void {
        super.handleClickEvent(node, event);
        if (MarkerNode.is(node)) {
            this.model.revealNode(node);
        }
    }

    protected handleCopy(event: ClipboardEvent): void {
        const uris = this.model.selectedNodes.filter(MarkerNode.is).map(node => node.uri.toString());
        if (uris.length > 0 && event.clipboardData) {
            event.clipboardData.setData('text/plain', uris.join('\n'));
            event.preventDefault();
        }
    }

    protected handleDown(event: KeyboardEvent): void {
        const node = this.model.getNextSelectableNode();
        super.handleDown(event);
        if (MarkerNode.is(node)) {
            this.model.revealNode(node);
        }
    }

    protected handleUp(event: KeyboardEvent): void {
        const node = this.model.getPrevSelectableNode();
        super.handleUp(event);
        if (MarkerNode.is(node)) {
            this.model.revealNode(node);
        }
    }

    protected renderTree(model: TreeModel): React.ReactNode {
        if (MarkerRootNode.is(model.root) && model.root.children.length > 0) {
            return super.renderTree(model);
        }
        return <div className='theia-widget-noInfo noMarkers'>No problems have been detected in the workspace so far.</div>;
    }

    protected renderCaption(node: TreeNode, props: NodeProps): React.ReactNode {
        if (MarkerInfoNode.is(node)) {
            return this.decorateMarkerFileNode(node);
        } else if (MarkerNode.is(node)) {
            return this.decorateMarkerNode(node);
        }
        return 'caption';
    }

    protected renderTailDecorations(node: TreeNode, props: NodeProps): JSX.Element {
        return <div className='row-button-container'>
            {this.renderRemoveButton(node)}
        </div>;
    }

    protected renderRemoveButton(node: TreeNode): React.ReactNode {
        return <ProblemMarkerRemoveButton model={this.model} node={node} />;
    }

    protected decorateMarkerNode(node: MarkerNode): React.ReactNode {
        if (ProblemMarker.is(node.marker)) {
            let severityClass: string = '';
            const problemMarker = node.marker;
            if (problemMarker.data.severity) {
                severityClass = this.getSeverityClass(problemMarker.data.severity);
            }
            return <div
                className='markerNode'
                title={`${problemMarker.data.message} (${problemMarker.data.range.start.line + 1}, ${problemMarker.data.range.start.character + 1})`}>
                <div>
                    <i className={severityClass}></i>
                </div>
                <div className='owner'>
                    {'[' + (problemMarker.data.source || problemMarker.owner) + ']'}
                </div>
                <div className='message'>{problemMarker.data.message}
                    {
                        (problemMarker.data.code) ? <span className='code'>{'[' + problemMarker.data.code + ']'}</span> : ''
                    }
                    <span className='position'>
                        {'(' + (problemMarker.data.range.start.line + 1) + ', ' + (problemMarker.data.range.start.character + 1) + ')'}
                    </span>
                </div>
            </div>;
        }
        return '';
    }

    protected getSeverityClass(severity: DiagnosticSeverity): string {
        switch (severity) {
            case 1: return 'fa fa-times-circle error';
            case 2: return 'fa fa-exclamation-circle warning';
            case 3: return 'fa fa-info-circle information';
            default: return 'fa fa-hand-o-up hint';
        }
    }

    protected decorateMarkerFileNode(node: MarkerInfoNode): React.ReactNode {
        return <div className='markerFileNode'>
            <div className={(node.icon || '') + ' file-icon'}></div>
            <div title={node.name} className='name'>{node.name}</div>
            <div title={node.description || ''} className='path'>{node.description || ''}</div>
            <div className='notification-count-container'>
                <span className='notification-count'>{node.numberOfMarkers.toString()}</span>
            </div>
        </div>;
    }

}

export class ProblemMarkerRemoveButton extends React.Component<{ model: ProblemTreeModel, node: TreeNode }> {

    render(): React.ReactNode {
        return <span className='remove-node' onClick={this.remove}></span>;
    }

    protected readonly remove = (e: React.MouseEvent<HTMLElement>) => this.doRemove(e);
    protected doRemove(e: React.MouseEvent<HTMLElement>): void {
        this.props.model.removeNode(this.props.node);
        e.stopPropagation();
    }
}
