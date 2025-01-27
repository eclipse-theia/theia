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
import { ArrayUtils, CommandRegistry, CompoundMenuNodeRole, DisposableCollection, MenuModelRegistry, MenuNode, nls } from '@theia/core';
import * as React from '@theia/core/shared/react';
import { codicon, ContextMenuRenderer } from '@theia/core/lib/browser';
import { NotebookCommands, NotebookMenus } from '../contributions/notebook-actions-contribution';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookKernelService } from '../service/notebook-kernel-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { NotebookCommand } from '../../common';
import { NotebookContextManager } from '../service/notebook-context-manager';

export interface NotebookMainToolbarProps {
    notebookModel: NotebookModel
    menuRegistry: MenuModelRegistry;
    notebookKernelService: NotebookKernelService;
    commandRegistry: CommandRegistry;
    contextKeyService: ContextKeyService;
    editorNode: HTMLElement;
    notebookContextManager: NotebookContextManager;
    contextMenuRenderer: ContextMenuRenderer;
}

@injectable()
export class NotebookMainToolbarRenderer {
    @inject(NotebookKernelService) protected readonly notebookKernelService: NotebookKernelService;
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;
    @inject(MenuModelRegistry) protected readonly menuRegistry: MenuModelRegistry;
    @inject(ContextKeyService) protected readonly contextKeyService: ContextKeyService;
    @inject(NotebookContextManager) protected readonly notebookContextManager: NotebookContextManager;
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;

    render(notebookModel: NotebookModel, editorNode: HTMLElement): React.ReactNode {
        return <NotebookMainToolbar notebookModel={notebookModel}
            menuRegistry={this.menuRegistry}
            notebookKernelService={this.notebookKernelService}
            commandRegistry={this.commandRegistry}
            contextKeyService={this.contextKeyService}
            editorNode={editorNode}
            notebookContextManager={this.notebookContextManager}
            contextMenuRenderer={this.contextMenuRenderer} />;
    }
}

interface NotebookMainToolbarState {
    selectedKernelLabel?: string;
    numberOfHiddenItems: number;
}

export class NotebookMainToolbar extends React.Component<NotebookMainToolbarProps, NotebookMainToolbarState> {

    // The minimum area between items and kernel select before hiding items in a context menu
    static readonly MIN_FREE_AREA = 10;

    protected toDispose = new DisposableCollection();

    protected nativeSubmenus = [
        NotebookMenus.NOTEBOOK_MAIN_TOOLBAR_CELL_ADD_GROUP[NotebookMenus.NOTEBOOK_MAIN_TOOLBAR_CELL_ADD_GROUP.length - 1],
        NotebookMenus.NOTEBOOK_MAIN_TOOLBAR_EXECUTION_GROUP[NotebookMenus.NOTEBOOK_MAIN_TOOLBAR_EXECUTION_GROUP.length - 1]];

    protected gapElement: HTMLDivElement | undefined;
    protected lastGapElementWidth: number = 0;

    protected resizeObserver: ResizeObserver = new ResizeObserver(() => this.calculateItemsToHide());

    constructor(props: NotebookMainToolbarProps) {
        super(props);

        this.state = {
            selectedKernelLabel: props.notebookKernelService.getSelectedOrSuggestedKernel(props.notebookModel)?.label,
            numberOfHiddenItems: 0,
        };
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
        this.getAllContextKeys(this.getMenuItems(), contextKeys);
        props.notebookContextManager.onDidChangeContext(e => {
            if (e.affects(contextKeys)) {
                this.forceUpdate();
            }
        });
        props.contextKeyService.onDidChange(e => {
            if (e.affects(contextKeys)) {
                this.forceUpdate();
            }
        });

    }

    override componentWillUnmount(): void {
        this.toDispose.dispose();
    }

    override componentDidUpdate(): void {
        this.calculateItemsToHide();
    }

    override componentDidMount(): void {
        this.calculateItemsToHide();
    }

    protected calculateItemsToHide(): void {
        const numberOfMenuItems = this.getMenuItems().length;
        if (this.gapElement && this.gapElement.getBoundingClientRect().width < NotebookMainToolbar.MIN_FREE_AREA && this.state.numberOfHiddenItems < numberOfMenuItems) {
            this.setState({ ...this.state, numberOfHiddenItems: this.state.numberOfHiddenItems + 1 });
            this.lastGapElementWidth = this.gapElement.getBoundingClientRect().width;
        } else if (this.gapElement && this.gapElement.getBoundingClientRect().width > this.lastGapElementWidth && this.state.numberOfHiddenItems > 0) {
            this.setState({ ...this.state, numberOfHiddenItems: 0 });
            this.lastGapElementWidth = this.gapElement.getBoundingClientRect().width;
        }
    }

    protected renderContextMenu(event: MouseEvent, menuItems: readonly MenuNode[]): void {
        const hiddenItems = menuItems.slice(menuItems.length - this.calculateNumberOfHiddenItems(menuItems));
        const contextMenu = this.props.menuRegistry.getMenu([NotebookMenus.NOTEBOOK_MAIN_TOOLBAR_HIDDEN_ITEMS_CONTEXT_MENU]);

        contextMenu.children.map(item => item.id).forEach(id => contextMenu.removeNode(id));
        hiddenItems.forEach(item => contextMenu.addNode(item));

        this.props.contextMenuRenderer.render({
            anchor: event,
            menuPath: [NotebookMenus.NOTEBOOK_MAIN_TOOLBAR_HIDDEN_ITEMS_CONTEXT_MENU],
            context: this.props.editorNode,
            args: [this.props.notebookModel.uri]
        });
    }

    override render(): React.ReactNode {
        const menuItems = this.getMenuItems();
        return <div className='theia-notebook-main-toolbar' id='notebook-main-toolbar'>
            {menuItems.slice(0, menuItems.length - this.calculateNumberOfHiddenItems(menuItems)).map(item => this.renderMenuItem(item))}
            {
                this.state.numberOfHiddenItems > 0 &&
                <span className={`${codicon('ellipsis')} action-label theia-notebook-main-toolbar-item`} onClick={e => this.renderContextMenu(e.nativeEvent, menuItems)} />
            }
            <div ref={element => this.gapElementChanged(element)} style={{ flexGrow: 1 }}></div>
            <div className='theia-notebook-main-toolbar-item action-label' id={NotebookCommands.SELECT_KERNEL_COMMAND.id}
                onClick={() => this.props.commandRegistry.executeCommand(NotebookCommands.SELECT_KERNEL_COMMAND.id, this.props.notebookModel)}>
                <span className={codicon('server-environment')} />
                <span className=' theia-notebook-main-toolbar-item-text' id='kernel-text'>
                    {this.state.selectedKernelLabel ?? nls.localizeByDefault('Select Kernel')}
                </span>
            </div>
        </div >;
    }

    protected gapElementChanged(element: HTMLDivElement | null): void {
        if (this.gapElement) {
            this.resizeObserver.unobserve(this.gapElement);
        }
        this.gapElement = element ?? undefined;
        if (this.gapElement) {
            this.lastGapElementWidth = this.gapElement.getBoundingClientRect().width;
            this.resizeObserver.observe(this.gapElement);
        }
    }

    protected renderMenuItem(item: MenuNode, submenu?: string): React.ReactNode {
        if (item.role === CompoundMenuNodeRole.Group) {
            const itemNodes = ArrayUtils.coalesce(item.children?.map(child => this.renderMenuItem(child, item.id)) ?? []);
            return <React.Fragment key={item.id}>
                {itemNodes}
                {itemNodes && itemNodes.length > 0 && <span key={`${item.id}-separator`} className='theia-notebook-toolbar-separator'></span>}
            </React.Fragment>;
        } else if ((this.nativeSubmenus.includes(submenu ?? '')) || !item.when || this.props.contextKeyService.match(item.when, this.props.editorNode)) {
            const visibleCommand = Boolean(this.props.commandRegistry.getVisibleHandler(item.command ?? '', this.props.notebookModel));
            if (!visibleCommand) {
                return undefined;
            }
            const command = this.props.commandRegistry.getCommand(item.command ?? '') as NotebookCommand | undefined;
            const label = command?.shortTitle ?? item.label;
            const title = command?.tooltip ?? item.label;
            return <div key={item.id} id={item.id} title={title} className={`theia-notebook-main-toolbar-item action-label${this.getAdditionalClasses(item)}`}
                onClick={() => {
                    if (item.command && (!item.when || this.props.contextKeyService.match(item.when, this.props.editorNode))) {
                        this.props.commandRegistry.executeCommand(item.command, this.props.notebookModel.uri);
                    }
                }}>
                <span className={item.icon} />
                <span className='theia-notebook-main-toolbar-item-text'>{label}</span>
            </div>;
        }
        return undefined;
    }

    protected getMenuItems(): readonly MenuNode[] {
        const menuPath = NotebookMenus.NOTEBOOK_MAIN_TOOLBAR;
        const pluginCommands = this.props.menuRegistry.getMenuNode(menuPath).children;
        const theiaCommands = this.props.menuRegistry.getMenu([menuPath]).children;
        return theiaCommands.concat(pluginCommands);
    }

    protected getAdditionalClasses(item: MenuNode): string {
        return !item.when || this.props.contextKeyService.match(item.when, this.props.editorNode) ? '' : ' theia-mod-disabled';
    }

    protected getAllContextKeys(menus: readonly MenuNode[], keySet: Set<string>): void {
        menus.filter(item => item.when)
            .forEach(item => this.props.contextKeyService.parseKeys(item.when!)?.forEach(key => keySet.add(key)));

        menus.filter(item => item.children && item.children.length > 0)
            .forEach(item => this.getAllContextKeys(item.children!, keySet));
    }

    protected calculateNumberOfHiddenItems(allMenuItems: readonly MenuNode[]): number {
        return this.state.numberOfHiddenItems >= allMenuItems.length ?
            allMenuItems.length :
            this.state.numberOfHiddenItems % allMenuItems.length;
    }
}
