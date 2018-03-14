/*
 * Copyright (C) 2017-2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, postConstruct } from "inversify";
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { CommandRegistry, MenuModelRegistry } from "@theia/core/lib/common";
import { Navigatable, SelectableTreeNode, Widget, KeybindingRegistry } from "@theia/core/lib/browser";
import { SHELL_TABBAR_CONTEXT_MENU } from "@theia/core/lib/browser";
import { FILE_NAVIGATOR_ID, FileNavigatorWidget } from './navigator-widget';
import { FileNavigatorPreferences } from "./navigator-preferences";

export namespace FileNavigatorCommands {
    export const REVEAL_IN_NAVIGATOR = {
        id: 'navigator.reveal',
        label: 'Reveal in Files'
    };
}

@injectable()
export class FileNavigatorContribution extends AbstractViewContribution<FileNavigatorWidget> {

    constructor(
        @inject(FileNavigatorPreferences) protected readonly fileNavigatorPreferences: FileNavigatorPreferences
    ) {
        super({
            widgetId: FILE_NAVIGATOR_ID,
            widgetName: 'Files',
            defaultWidgetOptions: {
                area: 'left',
                rank: 100
            },
            toggleCommandId: 'fileNavigator:toggle',
            toggleKeybinding: 'ctrlcmd+shift+e'
        });
    }

    @postConstruct()
    protected async init() {
        await this.fileNavigatorPreferences.ready;
        this.shell.currentChanged.connect(() => this.onCurrentWidgetChangedHandler());
    }

    registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(FileNavigatorCommands.REVEAL_IN_NAVIGATOR, {
            execute: () => this.openView({ activate: true }).then(() => this.selectWidgetFileNode(this.shell.currentWidget)),
            isEnabled: () => Navigatable.is(this.shell.currentWidget),
            isVisible: () => Navigatable.is(this.shell.currentWidget)
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        super.registerMenus(registry);
        registry.registerMenuAction(SHELL_TABBAR_CONTEXT_MENU, {
            commandId: FileNavigatorCommands.REVEAL_IN_NAVIGATOR.id,
            label: 'Reveal in Files',
            order: '5'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        super.registerKeybindings(registry);
        registry.registerKeybinding({
            command: FileNavigatorCommands.REVEAL_IN_NAVIGATOR.id,
            keybinding: "alt+r"
        });
    }

    /**
     * Reveals and selects node in the file navigator to which given widget is related.
     * Does nothing if given widget undefined or doesn't have related resource.
     *
     * @param widget widget file resource of which should be revealed and selected
     */
    async selectWidgetFileNode(widget: Widget | undefined): Promise<void> {
        if (Navigatable.is(widget)) {
            const fileUri = widget.getTargetUri();
            if (fileUri) {
                const { model } = await this.widget;
                const node = await model.revealFile(fileUri);
                if (SelectableTreeNode.is(node)) {
                    model.selectNode(node);
                }
            }
        }
    }

    protected onCurrentWidgetChangedHandler(): void {
        if (this.fileNavigatorPreferences['navigator.autoReveal']) {
            this.selectWidgetFileNode(this.shell.currentWidget);
        }
    }

}
