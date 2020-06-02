/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { Command, CommandRegistry } from '@theia/core/lib/common/command';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { VSXExtensionsViewContainer } from './vsx-extensions-view-container';
import { Widget } from '@theia/core/lib/browser/widgets/widget';
import { VSXExtensionsModel } from './vsx-extensions-model';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry, Color } from '@theia/core/lib/browser/color-registry';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser/frontend-application';

export namespace VSXExtensionsCommands {
    export const CLEAR_ALL: Command = {
        id: 'vsxExtensions.clearAll',
        category: 'Extensions',
        label: 'Clear Search Results',
        iconClass: 'clear-all'
    };
}

@injectable()
export class VSXExtensionsContribution extends AbstractViewContribution<VSXExtensionsViewContainer>
    implements ColorContribution, FrontendApplicationContribution, TabBarToolbarContribution {

    @inject(VSXExtensionsModel)
    protected readonly model: VSXExtensionsModel;

    constructor() {
        super({
            widgetId: VSXExtensionsViewContainer.ID,
            widgetName: VSXExtensionsViewContainer.LABEL,
            defaultWidgetOptions: {
                area: 'left',
                rank: 500
            },
            toggleCommandId: 'vsxExtensions.toggle',
            toggleKeybinding: 'ctrlcmd+shift+x'
        });
    }

    async initializeLayout(app: FrontendApplication): Promise<void> {
        await this.openView({ activate: false });
    }

    registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(VSXExtensionsCommands.CLEAR_ALL, {
            execute: w => this.withWidget(w, () => this.model.search.query = ''),
            isEnabled: w => this.withWidget(w, () => !!this.model.search.query),
            isVisible: w => this.withWidget(w, () => true)
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: VSXExtensionsCommands.CLEAR_ALL.id,
            command: VSXExtensionsCommands.CLEAR_ALL.id,
            tooltip: VSXExtensionsCommands.CLEAR_ALL.label,
            priority: 1,
            onDidChange: this.model.onDidChange
        });
    }

    registerColors(colors: ColorRegistry): void {
        // VS Code colors should be aligned with https://code.visualstudio.com/api/references/theme-color#extensions
        colors.register(
            {
                id: 'extensionButton.prominentBackground', defaults: {
                    dark: '#327e36',
                    light: '#327e36'
                }, description: 'Button background color for actions extension that stand out (e.g. install button).'
            },
            {
                id: 'extensionButton.prominentForeground', defaults: {
                    dark: Color.white,
                    light: Color.white
                }, description: 'Button foreground color for actions extension that stand out (e.g. install button).'
            },
            {
                id: 'extensionButton.prominentHoverBackground', defaults: {
                    dark: '#28632b',
                    light: '#28632b'
                }, description: 'Button background hover color for actions extension that stand out (e.g. install button).'
            }
        );
    }

    protected withWidget<T>(widget: Widget | undefined = this.tryGetWidget(), fn: (widget: VSXExtensionsViewContainer) => T): T | false {
        if (widget instanceof VSXExtensionsViewContainer && widget.id === VSXExtensionsViewContainer.ID) {
            return fn(widget);
        }
        return false;
    }
}
