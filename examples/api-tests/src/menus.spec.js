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

// @ts-check
describe('Menus', function () {

    const { assert } = chai;

    const { BrowserMenuBarContribution } = require('@theia/core/lib/browser/menu/browser-menu-plugin');
    const { BrowserContextMenuAccess } = require('@theia/core/lib/browser/menu/browser-context-menu-renderer');
    const { ApplicationShell } = require('@theia/core/lib/browser/shell/application-shell');
    const { ViewContainer } = require('@theia/core/lib/browser/view-container');
    const { waitForRevealed, waitForHidden } = require('@theia/core/lib/browser/widgets/widget');
    const { CallHierarchyContribution } = require('@theia/callhierarchy/lib/browser/callhierarchy-contribution');
    const { EXPLORER_VIEW_CONTAINER_ID } = require('@theia/navigator/lib/browser/navigator-widget');
    const { FileNavigatorContribution } = require('@theia/navigator/lib/browser/navigator-contribution');
    const { ScmContribution } = require('@theia/scm/lib/browser/scm-contribution');
    const { ScmHistoryContribution } = require('@theia/scm-extra/lib/browser/history/scm-history-contribution');
    const { OutlineViewContribution } = require('@theia/outline-view/lib/browser/outline-view-contribution');
    const { OutputContribution } = require('@theia/output/lib/browser/output-contribution');
    const { PluginFrontendViewContribution } = require('@theia/plugin-ext/lib/main/browser/plugin-frontend-view-contribution');
    const { ProblemContribution } = require('@theia/markers/lib/browser/problem/problem-contribution');
    const { SearchInWorkspaceFrontendContribution } = require('@theia/search-in-workspace/lib/browser/search-in-workspace-frontend-contribution');
    const { HostedPluginSupport } = require('@theia/plugin-ext/lib/hosted/browser/hosted-plugin');

    const container = window.theia.container;
    const shell = container.get(ApplicationShell);
    const menuBarContribution = container.get(BrowserMenuBarContribution);
    const menuBar = /** @type {import('@theia/core/lib/browser/menu/browser-menu-plugin').MenuBarWidget} */ (menuBarContribution.menuBar);
    const pluginService = container.get(HostedPluginSupport);

    before(async function () {
        await pluginService.didStart;
        // register views for the explorer view container
        await pluginService.activatePlugin('vscode.npm');
    });

    for (const contribution of [
        container.get(CallHierarchyContribution),
        container.get(FileNavigatorContribution),
        container.get(ScmContribution),
        container.get(ScmHistoryContribution),
        container.get(OutlineViewContribution),
        container.get(OutputContribution),
        container.get(PluginFrontendViewContribution),
        container.get(ProblemContribution),
        container.get(SearchInWorkspaceFrontendContribution)
    ]) {
        it(`should toggle '${contribution.viewLabel}' view`, async () => {
            await contribution.closeView();
            await menuBar.triggerMenuItem('View', contribution.viewLabel);
            await shell.waitForActivation(contribution.viewId);
        });
    }

    it('reveal more context menu in the explorer view container toolbar', async function () {
        const viewContainer = await shell.revealWidget(EXPLORER_VIEW_CONTAINER_ID);
        if (!(viewContainer instanceof ViewContainer)) {
            assert.isTrue(viewContainer instanceof ViewContainer);
            return;
        }

        const contribution = container.get(FileNavigatorContribution);
        const waitForParts = [];
        for (const part of viewContainer.getParts()) {
            if (part.wrapped.id !== contribution.viewId) {
                part.hide();
                waitForParts.push(waitForHidden(part.wrapped));
            } else {
                part.show();
                waitForParts.push(waitForRevealed(part.wrapped));
            }
        }
        await Promise.all(waitForParts);

        const contextMenuAccess = shell.leftPanelHandler.toolBar.showMoreContextMenu({ x: 0, y: 0 });
        if (!(contextMenuAccess instanceof BrowserContextMenuAccess)) {
            assert.isTrue(contextMenuAccess instanceof BrowserContextMenuAccess);
            return;
        }
        const contextMenu = contextMenuAccess.menu;

        await waitForRevealed(contextMenu);
        assert.notEqual(contextMenu.items.length, 0);
    });

});
