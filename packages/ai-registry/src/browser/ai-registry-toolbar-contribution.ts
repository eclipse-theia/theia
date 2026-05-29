// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { CommandRegistry } from '@theia/core';
import { Widget } from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ADD_MCP_SERVER_COMMAND } from '@theia/ai-mcp/lib/browser/mcp-configuration-command-contribution';
import { VSXExtensionsViewContainer } from '@theia/vsx-registry/lib/browser/vsx-extensions-view-container';
import { VSXExtensionsWidget } from '@theia/vsx-registry/lib/browser/vsx-extensions-widget';
import { inject, injectable } from '@theia/core/shared/inversify';

@injectable()
export class AIRegistryToolbarContribution implements TabBarToolbarContribution {

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: 'ai-registry.addMcpServerManually',
            command: ADD_MCP_SERVER_COMMAND.id,
            group: 'other_1',
            // The view container's own in-container items use `widget === getTabBarDelegate()`,
            // which resolves to either the container itself (multi-part mode) or one of its
            // child parts (single-part modes like Installed / Search). A separate toolbar
            // contribution cannot reach the container instance, so we match both shapes by id
            // and by the part-id prefix produced by `generateExtensionWidgetId`.
            isVisible: (widget: Widget) =>
                this.isVsxExtensionsWidget(widget)
                && this.commandRegistry.getCommand(ADD_MCP_SERVER_COMMAND.id) !== undefined
        });
    }

    protected isVsxExtensionsWidget(widget: Widget): boolean {
        return widget.id === VSXExtensionsViewContainer.ID
            || widget.id.startsWith(VSXExtensionsWidget.ID + ':');
    }
}
