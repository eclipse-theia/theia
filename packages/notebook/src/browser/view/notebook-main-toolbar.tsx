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
import { CommandRegistry, CompoundMenuNodeRole, MenuModelRegistry, MenuNode, nls } from '@theia/core';
import * as React from '@theia/core/shared/react';
import { codicon } from '@theia/core/lib/browser';
import { NotebookCommands, NotebookMenus } from '../contributions/notebook-actions-contribution';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookKernelService } from '../service/notebook-kernel-service';

export interface NotebookMainToolbarProps {
    notebookModel: NotebookModel
    menuRegistry: MenuModelRegistry;
    notebookKernelService: NotebookKernelService;
    commandRegistry: CommandRegistry;
}

export class NotebookMainToolbar extends React.Component<NotebookMainToolbarProps, {selectedKernelLabel?: string}> {

    constructor(props: NotebookMainToolbarProps) {
        super(props);

        this.state = {selectedKernelLabel: props.notebookKernelService.getSelectedOrSuggestedKernel(props.notebookModel)?.label};
        props.notebookKernelService.onDidChangeSelectedKernel(event => {
            if (props.notebookModel.uri.isEqual(event.notebook)) {
                this.setState({selectedKernelLabel: props.notebookKernelService.getKernel(event.newKernel ?? '')?.label});
            }
        });
    }

    override render(): React.ReactNode {
        return <div className='theia-notebook-main-toolbar'>
            {this.getMenuItems().map(item => this.renderMenuItem(item))}
            <div style={{flexGrow: 1}}></div>
            <div className='theia-notebook-main-toolbar-item'
                onClick={() => this.props.commandRegistry.executeCommand(NotebookCommands.SELECT_KERNEL_COMMAND.id, this.props.notebookModel)}>
                <span className={codicon('server-environment')}/>
                <span className=' theia-notebook-main-toolbar-item-text'>
                    {this.state.selectedKernelLabel ?? nls.localizeByDefault('Select Kernel')}
                </span>
            </div>
        </div>;
    }

    private renderMenuItem(item: MenuNode): React.ReactNode {
        if (item.role === CompoundMenuNodeRole.Group) {
            return <>
                {item.children?.map(child => this.renderMenuItem(child))}
                <span className='theia-notebook-toolbar-seperator'></span>
            </>;
        } else {
            return <div key={item.id} className='theia-notebook-main-toolbar-item'
                onClick={() => {
                    if (item.command) {
                        this.props.commandRegistry.executeCommand(item.command, this.props.notebookModel);
                    }
                }}>
                <span className={item.icon}/>
                <span className='theia-notebook-main-toolbar-item-text'>{item.label}</span>
                </div>;
        }
;
    }

    private getMenuItems(): readonly MenuNode[] {
        const menuPath = NotebookMenus.NOTEBOOK_MAIN_TOOLBAR;
        return this.props.menuRegistry.getMenu(menuPath).children;
    }
}
