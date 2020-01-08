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

    const { BrowserMenuBarContribution } = require('@theia/core/lib/browser/menu/browser-menu-plugin');
    const { ApplicationShell } = require('@theia/core/lib/browser/shell/application-shell');
    const { CallHierarchyContribution } = require('@theia/callhierarchy/lib/browser/callhierarchy-contribution');
    const { FileNavigatorContribution } = require('@theia/navigator/lib/browser/navigator-contribution');
    const { ScmContribution } = require('@theia/scm/lib/browser/scm-contribution');
    const { GitHistoryContribution } = require('@theia/git/lib/browser/history/git-history-contribution');
    const { OutlineViewContribution } = require('@theia/outline-view/lib/browser/outline-view-contribution');
    const { OutputContribution } = require('@theia/output/lib/browser/output-contribution');
    const { PluginFrontendViewContribution } = require('@theia/plugin-ext/lib/main/browser/plugin-frontend-view-contribution');
    const { ProblemContribution } = require('@theia/markers/lib/browser/problem/problem-contribution');
    const { SearchInWorkspaceFrontendContribution } = require('@theia/search-in-workspace/lib/browser/search-in-workspace-frontend-contribution');

    /** @type {import('inversify').Container} */
    const container = window['theia'].container;
    const shell = container.get(ApplicationShell);
    const menuBarContribution = container.get(BrowserMenuBarContribution);
    const menuBar = menuBarContribution.menuBar;

    for (const contribution of [
        container.get(CallHierarchyContribution),
        container.get(FileNavigatorContribution),
        container.get(ScmContribution),
        container.get(GitHistoryContribution),
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

});
