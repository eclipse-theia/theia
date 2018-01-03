/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { TabBar, Title, Widget } from '@phosphor/widgets';
import { VirtualElement, h } from '@phosphor/virtualdom';
import { MenuPath } from '../../common';
import { ContextMenuRenderer } from '../context-menu-renderer';

export const SHELL_TABBAR_CONTEXT_MENU: MenuPath = ['shell-tabbar-context-menu'];

export const TabBarRendererFactory = Symbol('TabBarRendererFactory');

/**
 * A tab bar renderer that offers a context menu.
 */
@injectable()
export class TabBarRenderer implements TabBar.IRenderer<any> {

    readonly closeIconSelector = TabBar.defaultRenderer.closeIconSelector;

    tabBar?: TabBar<Widget>;
    contextMenuPath?: MenuPath;

    constructor(
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer
    ) { }

    renderTab(data: TabBar.IRenderData<any>): VirtualElement {
        const defaultRenderer = TabBar.defaultRenderer;
        const title = data.title;
        const key = defaultRenderer.createTabKey(data);
        const style = defaultRenderer.createTabStyle(data);
        const className = defaultRenderer.createTabClass(data);
        const dataset = defaultRenderer.createTabDataset(data);
        return (
            h.li({
                key, className, title: title.caption, style, dataset,
                oncontextmenu: event => this.handleContextMenuEvent(event, title)
            },
                defaultRenderer.renderIcon(data),
                defaultRenderer.renderLabel(data),
                defaultRenderer.renderCloseIcon(data)
            )
        );
    }

    handleContextMenuEvent(event: MouseEvent, title: Title<Widget>) {
        if (this.contextMenuPath) {
            event.stopPropagation();
            event.preventDefault();

            if (this.tabBar !== undefined) {
                this.tabBar.currentTitle = title;
                this.tabBar.activate();
                if (title.owner !== null) {
                    title.owner.activate();
                }
            }

            this.contextMenuRenderer.render(this.contextMenuPath, event);
        }
    }
}
