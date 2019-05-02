/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import { Title } from '@phosphor/widgets';
import { AttachedProperty } from '@phosphor/properties';
import { DockPanel, Menu, TabBar, Widget } from '@phosphor/widgets';
import { CommandRegistry } from '@phosphor/commands';
import { VirtualElement, h } from '@phosphor/virtualdom';
import { PreferenceScope } from '@theia/core/lib/browser';
import { EditorWidget } from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import URI from '@theia/core/lib/common/uri';
import { FileAccess, FileSystem } from '@theia/filesystem/lib/common';
import { FoldersPreferencesProvider } from './folders-preferences-provider';

export class PreferencesEditorWidgetTitle extends Title<PreferencesEditorWidget> {
    clickableText?: string;
    clickableTextTooltip?: string;
    clickableTextCallback?: (value: string) => void;
}

export class PreferencesEditorWidget extends EditorWidget {
    scope: PreferenceScope | undefined;

    get title(): PreferencesEditorWidgetTitle {
        return new AttachedProperty<PreferencesEditorWidget, PreferencesEditorWidgetTitle>({
            name: 'title',
            create: owner => new PreferencesEditorWidgetTitle({ owner }),
        }).get(this);
    }
}

// TODO: put into DI context
export class PreferenceEditorTabHeaderRenderer extends TabBar.Renderer {

    constructor(
        private readonly workspaceService: WorkspaceService,
        private readonly fileSystem: FileSystem,
        private readonly foldersPreferenceProvider: FoldersPreferencesProvider
    ) {
        super();
    }

    renderTab(data: TabBar.IRenderData<PreferencesEditorWidget>): VirtualElement {
        const title = data.title;
        const key = this.createTabKey(data);
        const style = this.createTabStyle(data);
        const className = this.createTabClass(data);
        return h.li({
            key, className, title: title.caption, style
        },
            this.renderIcon(data),
            this.renderLabel(data),
            this.renderCloseIcon(data)
        );
    }

    renderLabel(data: TabBar.IRenderData<PreferencesEditorWidget>): VirtualElement {
        const clickableTitle = data.title.owner.title;
        if (clickableTitle.clickableText) {
            return h.div(
                h.span({ className: 'p-TabBar-tabLabel' }, data.title.label),
                h.span({
                    className: 'p-TabBar-tabLabel p-TabBar-tab-secondary-label',
                    title: clickableTitle.clickableTextTooltip,
                    onclick: event => {
                        const editorUri = data.title.owner.editor.uri;
                        this.refreshContextMenu(editorUri.parent.parent.toString(), clickableTitle.clickableTextCallback || (() => { }))
                            .then(menu => menu.open(event.x, event.y));
                    }
                }, clickableTitle.clickableText)
            );
        }
        return super.renderLabel(data);
    }

    protected async refreshContextMenu(activeMenuId: string, menuItemAction: (value: string) => void): Promise<Menu> {
        const commands = new CommandRegistry();
        const menu = new Menu({ commands });
        const roots = this.workspaceService.tryGetRoots().map(r => r.uri);
        for (const root of roots) {
            if (await this.canAccessSettings(root)) {
                const commandId = `switch_folder_pref_editor_to_${root}`;
                if (!commands.hasCommand(commandId)) {
                    const rootUri = new URI(root);
                    const isActive = rootUri.toString() === activeMenuId;
                    commands.addCommand(commandId, {
                        label: rootUri.displayName,
                        iconClass: isActive ? 'fa fa-check' : '',
                        execute: () => {
                            if (!isActive) {
                                menuItemAction(root);
                            }
                        }
                    });
                }

                menu.addItem({
                    type: 'command',
                    command: commandId
                });
            }
        }
        return menu;
    }

    private async canAccessSettings(folderUriStr: string): Promise<boolean> {
        const settingsUri = this.foldersPreferenceProvider.getConfigUri(folderUriStr);
        if (settingsUri) {
            return this.fileSystem.access(settingsUri.toString(), FileAccess.Constants.R_OK);
        }
        return this.fileSystem.access(folderUriStr, FileAccess.Constants.W_OK);
    }
}

// TODO put into DI context
export class PreferenceEditorContainerTabBarRenderer extends DockPanel.Renderer {

    constructor(
        private readonly workspaceService: WorkspaceService,
        private readonly fileSystem: FileSystem,
        private readonly foldersPreferenceProvider: FoldersPreferencesProvider
    ) {
        super();
    }

    createTabBar(): TabBar<Widget> {
        const bar = new TabBar({ renderer: new PreferenceEditorTabHeaderRenderer(this.workspaceService, this.fileSystem, this.foldersPreferenceProvider) });
        bar.addClass('p-DockPanel-tabBar');
        return bar;
    }
}
