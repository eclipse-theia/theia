/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import * as React from '@theia/core/shared/react';
import { injectable, interfaces, Container, postConstruct, inject } from '@theia/core/shared/inversify';
import {
    ApplicationShell,
    ContextMenuRenderer,
    defaultTreeProps,
    NodeProps,
    Saveable,
    TreeDecoratorService,
    TreeModel,
    TreeNode,
    TreeProps,
    TreeWidget,
    TREE_NODE_CONTENT_CLASS,
} from '@theia/core/lib/browser';
import { OpenEditorNode, OpenEditorsModel } from './navigator-open-editors-tree-model';
import { createFileTreeContainer, FileTreeModel, FileTreeWidget } from '@theia/filesystem/lib/browser';
import { OpenEditorsTreeDecoratorService } from './navigator-open-editors-decorator-service';
import { OPEN_EDITORS_CONTEXT_MENU } from './navigator-open-editors-menus';

const OPEN_EDITORS_TREE_PADDING = 18;

export const OPEN_EDITORS_PROPS: TreeProps = {
    ...defaultTreeProps,
    virtualized: false,
    contextMenuPath: OPEN_EDITORS_CONTEXT_MENU,
    expansionTogglePadding: OPEN_EDITORS_TREE_PADDING
};

export interface OpenEditorsNodeRow extends TreeWidget.NodeRow {
    node: OpenEditorNode;
}
@injectable()
export class OpenEditorsWidget extends FileTreeWidget {
    static ID = 'theia-open-editors-widget';
    static LABEL = 'Open Editors';

    @inject(ApplicationShell) protected readonly applicationShell: ApplicationShell;

    static createContainer(parent: interfaces.Container): Container {
        const child = createFileTreeContainer(parent);

        child.unbind(FileTreeModel);
        child.bind(OpenEditorsModel).toSelf();
        child.rebind(TreeModel).toService(OpenEditorsModel);

        child.unbind(FileTreeWidget);
        child.bind(OpenEditorsWidget).toSelf();

        child.rebind(TreeProps).toConstantValue(OPEN_EDITORS_PROPS);

        child.bind(OpenEditorsTreeDecoratorService).toSelf().inSingletonScope();
        child.rebind(TreeDecoratorService).toService(OpenEditorsTreeDecoratorService);
        return child;
    }

    static createWidget(parent: interfaces.Container): OpenEditorsWidget {
        return OpenEditorsWidget.createContainer(parent).get(OpenEditorsWidget);
    }

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(OpenEditorsModel) readonly model: OpenEditorsModel,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);
    }

    @postConstruct()
    init(): void {
        super.init();
        this.id = OpenEditorsWidget.ID;
        this.title.label = OpenEditorsWidget.LABEL;
        this.addClass(OpenEditorsWidget.ID);
        this.update();
    }

    // eslint-disable-next-line no-null/no-null
    protected activeTreeNodePrefixElement: string | undefined | null;

    protected renderNode(node: OpenEditorNode, props: NodeProps): React.ReactNode {
        if (!TreeNode.isVisible(node)) {
            return undefined;
        }
        const attributes = this.createNodeAttributes(node, props);
        const content = <div className={`${TREE_NODE_CONTENT_CLASS}`}>
            {this.renderPrefixIcon(node)}
            {this.decorateIcon(node, this.renderIcon(node, props))}
            {this.renderCaptionAffixes(node, props, 'captionPrefixes')}
            {this.renderCaption(node, props)}
            {this.renderCaptionAffixes(node, props, 'captionSuffixes')}
            {this.renderTailDecorations(node, props)}
        </div >;
        return React.createElement('div', attributes, content);
    }

    protected doRenderNodeRow({ node, depth }: OpenEditorsNodeRow): React.ReactNode {
        return <div className={`open-editors-node-row ${this.getPrefixIconClass(node)}`}>
            {this.renderIndent(node, { depth })}
            {this.renderNode(node, { depth })}
        </div>;
    }

    protected renderPrefixIcon(node: OpenEditorNode): React.ReactNode {
        return (
            <div className='open-editors-prefix-icon-container'>
                <div data-id={node.id}
                    className='open-editors-prefix-icon dirty codicon codicon-circle-filled'
                />
                <div data-id={node.id}
                    onClick={this.closeEditor}
                    className='open-editors-prefix-icon close codicon codicon-close'
                />
            </div>);
    }

    protected getPrefixIconClass(node: OpenEditorNode): string {
        const saveable = Saveable.get(node.widget);
        if (saveable) {
            return saveable.dirty ? 'dirty' : '';
        }
        return '';
    }

    protected closeEditor = async (e: React.MouseEvent<HTMLDivElement>) => this.doCloseEditor(e);
    protected async doCloseEditor(e: React.MouseEvent<HTMLDivElement>): Promise<void> {
        const widgetId = e.currentTarget.getAttribute('data-id');
        if (widgetId) {
            await this.applicationShell.closeWidget(widgetId);
        }
    }
}
