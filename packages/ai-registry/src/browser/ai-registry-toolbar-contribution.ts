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
            // Mirror the visibility of the view container's own items (Install from VSIX, Refresh,
            // ...): they use `widget === getTabBarDelegate()`, which resolves to the container in
            // multi-part mode and to the single visible part otherwise. Replicating that exact
            // check keeps this command on the main Extensions toolbar only, not on every section
            // header. We locate the container by walking up from the toolbar's widget rather than
            // matching part ids, which would (wrongly) match every sub-view.
            isVisible: (widget: Widget) =>
                this.isOnExtensionsTabBar(widget)
                && this.commandRegistry.getCommand(ADD_MCP_SERVER_COMMAND.id) !== undefined
        });
    }

    /**
     * True when `widget` is the toolbar delegate of the Extensions view container - i.e. the
     * widget whose toolbar represents the main Extensions view, exactly as the container's own
     * items are gated. Returns false for the individual section parts.
     */
    protected isOnExtensionsTabBar(widget: Widget): boolean {
        const container = this.findExtensionsContainer(widget);
        return !!container && widget === container.getTabBarDelegate();
    }

    protected findExtensionsContainer(widget: Widget): VSXExtensionsViewContainer | undefined {
        let current: Widget | undefined = widget;
        while (current) {
            if (current instanceof VSXExtensionsViewContainer) {
                return current;
            }
            current = current.parent ?? undefined;
        }
        return undefined;
    }
}
