/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, postConstruct, inject } from "inversify";
import { Widget, FocusTracker } from "@phosphor/widgets";
import { FILE_NAVIGATOR_ID, FileNavigatorWidget } from './navigator-widget';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import URI from '@theia/core/lib/common/uri';
import { ISelectableTreeNode } from '@theia/core/lib/browser';
import { MenuModelRegistry } from '@theia/core/lib/common/menu';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { SHELL_TABBAR_CONTEXT_MENU } from '@theia/core/lib/browser/shell/tab-bars';
import { NavigatorPreferences } from './navigator-preferences';

export namespace FileNavigator {

    export type Revealable = { readonly uri: URI } | URI;
    export namespace Revealable {
        // tslint:disable-next-line:no-any
        export function is(arg: any): arg is Revealable {
            return arg instanceof URI || arg && arg['uri'] instanceof URI;
        }
        // tslint:disable-next-line:no-any
        export function getUri(arg: Revealable): URI {
            return arg instanceof URI ? arg : arg.uri;
        }
    }

}

export namespace FileNavigatorCommands {
    export const REVEAL = {
        id: 'navigator.reveal',
        label: 'Reveal in Files'
    };
}

@injectable()
export class FileNavigatorContribution extends AbstractViewContribution<FileNavigatorWidget> {

    @inject(NavigatorPreferences)
    protected readonly preferences: NavigatorPreferences;

    protected autoRevealEnabled: boolean;
    protected currentWidgetChangeListener: (shell: ApplicationShell, args: FocusTracker.IChangedArgs<Widget>) => void;

    constructor() {
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
        this.currentWidgetChangeListener = ((shell, args) => {
            if (this.autoRevealEnabled) {
                const { newValue } = args;
                if (FileNavigator.Revealable.is(newValue)) {
                    this.doReveal(newValue);
                }
            }
        });
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(FileNavigatorCommands.REVEAL, {
            execute: () => {
                const { currentWidget } = this.shell;
                if (FileNavigator.Revealable.is(currentWidget)) {
                    this.doReveal(currentWidget);
                }
            },
            isEnabled: () => FileNavigator.Revealable.is(this.shell.currentWidget),
            isVisible: () => FileNavigator.Revealable.is(this.shell.currentWidget)
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(SHELL_TABBAR_CONTEXT_MENU, {
            commandId: FileNavigatorCommands.REVEAL.id,
            order: 'navigator-01'
        });
    }

    @postConstruct()
    protected init(): void {
        this.shell.currentChanged.connect(this.currentWidgetChangeListener);
        this.autoRevealEnabled = this.preferences['navigator.autoReveal.enabled'];
        this.preferences.onPreferenceChanged(event => {
            const { preferenceName, newValue } = event;
            if (preferenceName === 'navigator.autoReveal.enabled') {
                const enabled = !!newValue;
                if (this.autoRevealEnabled !== enabled) {
                    this.autoRevealEnabled = enabled;
                }
            }
        });
    }

    protected async doReveal(revealable: FileNavigator.Revealable): Promise<void> {
        const uri = FileNavigator.Revealable.getUri(revealable);
        const { model } = await this.widget;
        const node = await model.tryGetNode(uri);
        if (ISelectableTreeNode.is(node)) {
            model.selectNode(node, true);
        }
    }

}
