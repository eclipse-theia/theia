// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
import { ProblemManager } from './problem-manager';
import { ProblemMarker } from '../../common/problem-marker';
import { ProblemTreeModel } from './problem-tree-model';
import { MarkerInfoNode, MarkerNode, MarkerRootNode } from '../marker-tree';
import {
    TreeWidget, TreeProps, ContextMenuRenderer, TreeNode, NodeProps, TreeModel,
    ApplicationShell, Navigatable, ExpandableTreeNode, SelectableTreeNode, TREE_NODE_INFO_CLASS, codicon, Message
} from '@theia/core/lib/browser';
import { DiagnosticSeverity } from '@theia/core/shared/vscode-languageserver-protocol';
import * as React from '@theia/core/shared/react';
import { ProblemPreferences } from '../../common/problem-preferences';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';

export const PROBLEMS_WIDGET_ID = 'problems';

interface MarkerNodeFormatData {
    severityClass: string;
    severityLabel: string;
    message: string;
    line: number;
    column: number;
    location: string;
    source: string;
    code: string;
}

@injectable()
export class ProblemWidget extends TreeWidget {

    protected readonly toDisposeOnCurrentWidgetChanged = new DisposableCollection();

    @inject(ProblemPreferences)
    protected readonly preferences: ProblemPreferences;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ProblemManager)
    protected readonly problemManager: ProblemManager;

    constructor(
        @inject(TreeProps) treeProps: TreeProps,
        @inject(ProblemTreeModel) override readonly model: ProblemTreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(treeProps, model, contextMenuRenderer);

        this.id = PROBLEMS_WIDGET_ID;
        this.title.label = nls.localizeByDefault('Problems');
        this.title.caption = this.title.label;
        this.title.iconClass = codicon('warning');
        this.title.closable = true;
        this.addClass('theia-marker-container');

        this.addClipboardListener(this.node, 'copy', e => this.handleCopy(e));
    }

    @postConstruct()
    protected override init(): void {
        super.init();
        this.updateFollowActiveEditor();
        this.toDispose.push(this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'problems.autoReveal') {
                this.updateFollowActiveEditor();
            }
        }));
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.update();
    }

    protected updateFollowActiveEditor(): void {
        this.toDisposeOnCurrentWidgetChanged.dispose();
        this.toDispose.push(this.toDisposeOnCurrentWidgetChanged);
        if (this.preferences.get('problems.autoReveal')) {
            this.followActiveEditor();
        }
    }

    protected followActiveEditor(): void {
        this.autoRevealFromActiveEditor();
        this.toDisposeOnCurrentWidgetChanged.push(this.shell.onDidChangeCurrentWidget(() => this.autoRevealFromActiveEditor()));
    }

    protected autoRevealFromActiveEditor(): void {
        const widget = this.shell.currentWidget;
        if (widget && Navigatable.is(widget)) {
            const uri = widget.getResourceUri();
            const node = uri && this.model.getNode(uri.toString());
            if (ExpandableTreeNode.is(node) && SelectableTreeNode.is(node)) {
                this.model.expandNode(node);
                this.model.selectNode(node);
            }
        }
    }

    override storeState(): object {
        // no-op
        return {};
    }
    protected superStoreState(): object {
        return super.storeState();
    }
    override restoreState(state: object): void {
        // no-op
    }
    protected superRestoreState(state: object): void {
        super.restoreState(state);
        return;
    }

    protected override tapNode(node?: TreeNode): void {
        super.tapNode(node);
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

    protected override handleDown(event: KeyboardEvent): void {
        const node = this.model.getNextSelectableNode();
        super.handleDown(event);
        if (MarkerNode.is(node)) {
            this.model.revealNode(node);
        }
    }

    protected override handleUp(event: KeyboardEvent): void {
        const node = this.model.getPrevSelectableNode();
        super.handleUp(event);
        if (MarkerNode.is(node)) {
            this.model.revealNode(node);
        }
    }

    protected override renderTree(model: TreeModel): React.ReactNode {
        if (MarkerRootNode.is(model.root) && model.root.children.length > 0) {
            return super.renderTree(model);
        }
        return <div className='theia-widget-noInfo noMarkers'>{nls.localize('theia/markers/noProblems', 'No problems have been detected in the workspace so far.')}</div>;
    }

    protected override renderCaption(node: TreeNode, props: NodeProps): React.ReactNode {
        if (MarkerInfoNode.is(node)) {
            return this.decorateMarkerFileNode(node);
        } else if (MarkerNode.is(node)) {
            return this.decorateMarkerNode(node);
        }
        return 'caption';
    }

    protected override renderTailDecorations(node: TreeNode, props: NodeProps): React.JSX.Element {
        return <div className='row-button-container'>
            {this.renderRemoveButton(node)}
        </div>;
    }

    protected renderRemoveButton(node: TreeNode): React.ReactNode {
        return <ProblemMarkerRemoveButton model={this.model} node={node} />;
    }

    protected getMarkerNodeFormatData(marker: ProblemMarker): MarkerNodeFormatData {
        const line = marker.data.range.start.line + 1;
        const column = marker.data.range.start.character + 1;
        const location = nls.localizeByDefault('Ln {0}, Col {1}', line, column);
        const severityClass = marker.data.severity ? this.getSeverityClass(marker.data.severity) : '';
        const severityLabel = marker.data.severity ? this.getSeverityLabel(marker.data.severity) : '';
        const source = marker.data.source ? `${marker.data.source}` : '';
        const code = marker.data.code ? `(${marker.data.code})` : '';
        return {
            severityClass,
            severityLabel,
            message: marker.data.message,
            line,
            column,
            location,
            source,
            code,
        };
    }

    protected decorateMarkerNode(node: MarkerNode): React.ReactNode {
        if (ProblemMarker.is(node.marker)) {
            const problemMarker = node.marker;
            const data = this.getMarkerNodeFormatData(problemMarker);
            return <div
                className='markerNode'
                title={`${data.message} (${data.line}, ${data.column})`}>
                <div>
                    <i className={`${data.severityClass} ${TREE_NODE_INFO_CLASS}`}></i>
                </div>
                <div className='message'>{data.message}
                    {(!!data.source || !!data.code) &&
                        <span className={'owner ' + TREE_NODE_INFO_CLASS}>
                            {data.source || ''}
                            {data.code || ''}
                        </span>
                    }
                    <span className={'position ' + TREE_NODE_INFO_CLASS}>
                        {`[${data.location}]`}
                    </span>
                </div>
            </div>;
        }
        return '';
    }

    formatMarkerNodeAsText(node: MarkerNode): string {
        const marker = node.marker as ProblemMarker;
        const data = this.getMarkerNodeFormatData(marker);
        const sourceCode = [data.source, data.code].filter(s => s).join(' ');
        const suffix = sourceCode ? ` ${sourceCode}` : '';
        return `${data.severityLabel}: ${data.message}${suffix} [${data.location}]`;
    }

    protected getSeverityLabel(severity: DiagnosticSeverity): string {
        switch (severity) {
            case DiagnosticSeverity.Error: return nls.localizeByDefault('Error');
            case DiagnosticSeverity.Warning: return nls.localizeByDefault('Warning');
            case DiagnosticSeverity.Information: return nls.localizeByDefault('Info');
            default: return nls.localizeByDefault('Hint');
        }
    }

    protected getSeverityClass(severity: DiagnosticSeverity): string {
        switch (severity) {
            case DiagnosticSeverity.Error: return `${codicon('error')} error`;
            case DiagnosticSeverity.Warning: return `${codicon('warning')} warning`;
            case DiagnosticSeverity.Information: return `${codicon('info')} information`;
            default: return `${codicon('thumbsup')} hint`;
        }
    }

    formatMarkerFileNodeAsText(node: MarkerInfoNode): string {
        const name = this.toNodeName(node);
        const description = this.toNodeDescription(node);
        return description ? `${name} ${description}` : name;
    }

    protected decorateMarkerFileNode(node: MarkerInfoNode): React.ReactNode {
        const icon = this.toNodeIcon(node);
        const name = this.toNodeName(node);
        const description = this.toNodeDescription(node);
        // Use a custom scheme so that we fallback to the `DefaultUriLabelProviderContribution`.
        const path = this.labelProvider.getLongName(node.uri.withScheme('marker'));
        return <div title={path} className='markerFileNode'>
            {icon && <div className={icon + ' file-icon'}></div>}
            <div className='name'>{name}</div>
            <div className={'path ' + TREE_NODE_INFO_CLASS}>{description}</div>
            <div className='notification-count-container'>
                <span className='notification-count'>{node.numberOfMarkers.toString()}</span>
            </div>
        </div>;
    }

}

export class ProblemMarkerRemoveButton extends React.Component<{ model: ProblemTreeModel, node: TreeNode }> {

    override render(): React.ReactNode {
        return <span className={codicon('close')} onClick={this.remove}></span>;
    }

    protected readonly remove = (e: React.MouseEvent<HTMLElement>) => this.doRemove(e);
    protected doRemove(e: React.MouseEvent<HTMLElement>): void {
        this.props.model.removeNode(this.props.node);
        e.stopPropagation();
    }
}
