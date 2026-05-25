// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import {
    ApplicationShell,
    createTreeContainer,
    NodeProps,
    TreeModel,
    TreeModelImpl,
    Widget
} from '@theia/core/lib/browser';
import { CommandMenu } from '@theia/core/lib/common/menu';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { Decoration } from '@theia/core/lib/browser/decorations-service';
import { ScmWidget } from '@theia/scm/lib/browser/scm-widget';
import { ScmFileChangeNode } from '@theia/scm/lib/browser/scm-tree-model';
import { ScmGroupsTreeModel } from '@theia/scm/lib/browser/scm-groups-tree-model';
import {
    ScmResourceComponent,
    ScmTreeWidget
} from '@theia/scm/lib/browser/scm-tree-widget';
import { ScmTreeModelProps } from '@theia/scm/lib/browser/scm-tree-model';

@injectable()
export class QaapScmTreeWidget extends ScmTreeWidget {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    protected override renderScmResourceComponent(node: ScmFileChangeNode, props: NodeProps, parentPath: URI, caption: React.ReactNode): React.ReactNode {
        return <QaapScmResourceComponent
            key={node.sourceUri}
            model={this.model}
            treeNode={node}
            contextMenuRenderer={this.contextMenuRenderer}
            menus={this.menus}
            contextKeys={this.contextKeys}
            labelProvider={this.labelProvider}
            corePreferences={this.corePreferences}
            caption={caption}
            {...{
                ...this.props,
                parentPath,
                sourceUri: node.sourceUri,
                decoration: this.decorationsService.getDecoration(new URI(node.sourceUri), true)[0],
                colors: this.colors,
                isLightTheme: this.isCurrentThemeLight(),
                renderExpansionToggle: () => this.renderExpansionToggle(node, props),
                collapseContainingPanel: () => this.collapseContainingPanel()
            }}
        />;
    }

    protected collapseContainingPanel(): void {
        let widget: Widget | null = this;
        while (widget) {
            const area = this.shell.getAreaFor(widget);
            if (area === 'left' || area === 'right') {
                this.shell.collapsePanel(area);
                return;
            }
            widget = widget.parent;
        }
    }
}

export class QaapScmResourceComponent extends ScmResourceComponent {

    declare readonly props: QaapScmResourceComponent.Props;

    protected override open = () => {
        const resource = this.props.model.getResourceFromNode(this.props.treeNode);
        if (resource) {
            resource.open()
                .then(() => this.props.collapseContainingPanel())
                .catch(e => console.error('Failed to open a SCM resource', e));
        }
    };

    protected override handleInlineCommand = (node: CommandMenu): void => {
        if (this.isOpenResourceCommand(node)) {
            this.props.collapseContainingPanel();
        }
    };

    protected isOpenResourceCommand(node: CommandMenu): boolean {
        return node.id === 'git.openFile'
            || node.id === 'git.openFile2'
            || node.id === 'git.openChange';
    }

    protected override handleClick = (event: React.MouseEvent) => {
        if (!this.hasCtrlCmdOrShiftMask(event)) {
            this.open();
        }
    };

    protected override handleDoubleClick = () => { };
}

export namespace QaapScmResourceComponent {
    export interface Props extends ScmResourceComponent.Props {
        treeNode: ScmFileChangeNode;
        parentPath: URI;
        sourceUri: string;
        decoration: Decoration | undefined;
        colors: ColorRegistry;
        isLightTheme: boolean;
        collapseContainingPanel: () => void;
    }
}

export function createQaapScmWidgetContainer(parent: interfaces.Container): interfaces.Container {
    const child = createTreeContainer(parent, {
        props: {
            virtualized: true,
            search: true,
            multiSelect: true,
        },
        widget: QaapScmTreeWidget,
    });

    child.bind(ScmTreeWidget).toService(QaapScmTreeWidget);
    child.unbind(TreeModel);
    child.unbind(TreeModelImpl);

    child.bind(ScmTreeModelProps).toConstantValue({
        defaultExpansion: 'expanded',
    });
    child.bind(ScmGroupsTreeModel).toSelf();
    child.bind(TreeModel).toService(ScmGroupsTreeModel);
    child.bind(ScmWidget).toSelf();

    return child;
}
