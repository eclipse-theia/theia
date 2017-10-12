/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { injectable, inject } from 'inversify';
import { ProblemManager } from './problem-marker';
import { ProblemMarker } from '../../common/problem-marker';
import { ProblemTreeModel } from './problem-tree-model';
import { MarkerInfoNode, MarkerNode } from '../marker-tree';
import { TreeWidget, TreeProps, ContextMenuRenderer, ITreeNode, NodeProps, ITreeModel, ISelectableTreeNode } from "@theia/core/lib/browser";
import { h } from "@phosphor/virtualdom/lib";
import { DiagnosticSeverity } from 'vscode-languageserver-types';
import { Message } from '@phosphor/messaging';
import { FileIconProvider } from '@theia/filesystem/lib/browser/icons/file-icons';

@injectable()
export class ProblemWidget extends TreeWidget {

    constructor(
        @inject(ProblemManager) protected readonly problemManager: ProblemManager,
        @inject(TreeProps) readonly treeProps: TreeProps,
        @inject(ProblemTreeModel) readonly model: ProblemTreeModel,
        @inject(ContextMenuRenderer) readonly contextMenuRenderer: ContextMenuRenderer,
        @inject(FileIconProvider) protected readonly iconProvider: FileIconProvider
    ) {
        super(treeProps, model, contextMenuRenderer);

        this.id = 'problems';
        this.title.label = 'Problems';
        this.title.iconClass = 'fa fa-exclamation-circle';
        this.title.closable = true;
        this.addClass('theia-marker-container');

        this.addClipboardListener(this.node, 'copy', e => this.handleCopy(e));
    }

    protected handleCopy(event: ClipboardEvent): void {
        const node = this.model.selectedNode;
        if (!node) {
            return;
        }
        if (MarkerNode.is(node)) {
            const uri = node.uri;
            event.clipboardData.setData('text/plain', uri.toString());
            event.preventDefault();
        }
    }

    protected onUpdateRequest(msg: Message): void {
        if (!this.model.selectedNode && ISelectableTreeNode.is(this.model.root)) {
            this.model.selectNode(this.model.root);
        }
        super.onUpdateRequest(msg);
    }

    protected renderTree(model: ITreeModel): h.Child {
        return super.renderTree(model) || h.div({ className: 'noMarkers' }, 'No problems have been detected in the workspace so far.');
    }

    protected decorateCaption(node: ITreeNode, caption: h.Child, props: NodeProps): h.Child {
        if (MarkerInfoNode.is(node)) {
            return super.decorateExpandableCaption(node, this.decorateMarkerFileNode(node, caption), props);
        } else if (MarkerNode.is(node)) {
            return super.decorateCaption(node, this.decorateMarkerNode(node, caption), props);
        }
        return h.div({}, 'caption');
    }

    protected decorateMarkerNode(node: MarkerNode, caption: h.Child): h.Child {
        if (ProblemMarker.is(node.marker)) {
            let severityClass: string = '';
            const problemMarker = node.marker;
            if (problemMarker.data.severity) {
                severityClass = this.getSeverityClass(problemMarker.data.severity);
            }
            const severityDiv = h.div({}, h.i({ className: severityClass }));
            const ownerDiv = h.div({ className: 'owner' }, '[' + problemMarker.owner + ']');
            const startingPointDiv = h.span({ className: 'position' },
                '(' + (problemMarker.data.range.start.line + 1) + ', ' + (problemMarker.data.range.start.character + 1) + ')');
            const messageDiv = h.div({ className: 'message' }, problemMarker.data.message, startingPointDiv);
            return h.div({ className: 'markerNode' }, severityDiv, ownerDiv, messageDiv);
        }
        return '';
    }

    protected getSeverityClass(severity: DiagnosticSeverity): string {
        switch (severity) {
            case 1: return 'fa fa-times-circle error';
            case 2: return 'fa fa-exclamation-circle warning';
            case 3: return 'fa fa-info-circle information';
            case 4: return 'fa fa-hand-o-up hint';
            default: return '';
        }
    }

    protected decorateMarkerFileNode(node: MarkerInfoNode, caption: h.Child): h.Child {
        const fileIcon = this.iconProvider.getFileIconForURI(node.uri);
        const filenameDiv = h.div({ className: fileIcon }, node.uri.displayName);
        const pathDiv = h.div({ className: 'path' }, node.uri.path.toString());
        const counterDiv = h.div({ className: 'counter' }, node.numberOfMarkers.toString());
        return h.div({ className: 'markerFileNode' }, filenameDiv, pathDiv, counterDiv);
    }
}
