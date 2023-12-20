// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
import { CommandRegistry, CompoundMenuNodeRole, DisposableCollection, MenuModelRegistry, MenuNode, nls } from '@theia/core';
import * as React from '@theia/core/shared/react';
import { codicon } from '@theia/core/lib/browser';
import { NotebookCommands, NotebookMenus } from '../contributions/notebook-actions-contribution';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookKernelService } from '../service/notebook-kernel-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';

export interface NotebookMainToolbarProps {
    notebookModel: NotebookModel
    menuRegistry: MenuModelRegistry;
    notebookKernelService: NotebookKernelService;
    commandRegistry: CommandRegistry;
    contextKeyService: ContextKeyService;
}

@injectable()
export class NotebookMainToolbarRenderer {
    @inject(NotebookKernelService) protected readonly notebookKernelService: NotebookKernelService;
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;
    @inject(MenuModelRegistry) protected readonly menuRegistry: MenuModelRegistry;
    @inject(ContextKeyService) protected readonly contextKeyService: ContextKeyService;

    render(notebookModel: NotebookModel): React.ReactNode {
        return <NotebookMainToolbar notebookModel={notebookModel}
            menuRegistry={this.menuRegistry}
            notebookKernelService={this.notebookKernelService}
            commandRegistry={this.commandRegistry}
            contextKeyService={this.contextKeyService}
        />;
    }
}

export class NotebookMainToolbar extends React.Component<NotebookMainToolbarProps, { selectedKernelLabel?: string }> {

    protected toDispose = new DisposableCollection();

    constructor(props: NotebookMainToolbarProps) {
        super(props);

        this.state = { selectedKernelLabel: props.notebookKernelService.getSelectedOrSuggestedKernel(props.notebookModel)?.label };
        this.toDispose.push(props.notebookKernelService.onDidChangeSelectedKernel(event => {
            if (props.notebookModel.uri.isEqual(event.notebook)) {
                this.setState({ selectedKernelLabel: props.notebookKernelService.getKernel(event.newKernel ?? '')?.label });
            }
        }));
        // in case the selected kernel is added after the notebook is loaded
        this.toDispose.push(props.notebookKernelService.onDidAddKernel(() => {
            if (!this.state.selectedKernelLabel) {
                this.setState({ selectedKernelLabel: props.notebookKernelService.getSelectedOrSuggestedKernel(props.notebookModel)?.label });
            }
        }));

        // TODO maybe we need a mechanism to check for changes in the menu to update this toolbar
        const contextKeys = new Set<string>();
        this.getMenuItems().filter(item => item.when).forEach(item => props.contextKeyService.parseKeys(item.when!)?.forEach(key => contextKeys.add(key)));
        props.contextKeyService.onDidChange(e => {
            if (e.affects(contextKeys)) {
                this.forceUpdate();
            }
        });
    }

    override componentWillUnmount(): void {
        this.toDispose.dispose();
    }

    override render(): React.ReactNode {
        return <div className='theia-notebook-main-toolbar'>
            {this.getMenuItems().map(item => this.renderMenuItem(item))}
            <div style={{ flexGrow: 1 }}></div>
            <div className='theia-notebook-main-toolbar-item'
                onClick={() => this.props.commandRegistry.executeCommand(NotebookCommands.SELECT_KERNEL_COMMAND.id, this.props.notebookModel)}>
                <span className={codicon('server-environment')} />
                <span className=' theia-notebook-main-toolbar-item-text'>
                    {this.state.selectedKernelLabel ?? nls.localizeByDefault('Select Kernel')}
                </span>
            </div>
        </div>;
    }

    protected renderMenuItem(item: MenuNode): React.ReactNode {
        if (item.role === CompoundMenuNodeRole.Group) {
            const itemNodes = item.children?.map(child => this.renderMenuItem(child)).filter(child => !!child);
            return <React.Fragment key={item.id}>
                {itemNodes}
                {itemNodes && itemNodes.length > 0 && <span key={`${item.id}-separator`} className='theia-notebook-toolbar-separator'></span>}
            </React.Fragment>;
        } else if (!item.when || this.props.contextKeyService.match(item.when)) {
            return <div key={item.id} title={item.id} className='theia-notebook-main-toolbar-item'
                onClick={() => {
                    if (item.command) {
                        this.props.commandRegistry.executeCommand(item.command, this.props.notebookModel);
                    }
                }}>
                <span className={item.icon} />
                <span className='theia-notebook-main-toolbar-item-text'>{item.label}</span>
            </div>;
        }
        return undefined;
    }

    private getMenuItems(): readonly MenuNode[] {
        const menuPath = NotebookMenus.NOTEBOOK_MAIN_TOOLBAR;
        const pluginCommands = this.props.menuRegistry.getMenuNode(menuPath).children;
        return this.props.menuRegistry.getMenu([menuPath]).children.concat(pluginCommands);
    }
}
