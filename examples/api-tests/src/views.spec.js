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
describe('Views', function () {

    const { assert } = chai;

    const { ApplicationShell } = require('@theia/core/lib/browser/shell/application-shell');
    const { FileNavigatorContribution } = require('@theia/navigator/lib/browser/navigator-contribution');
    const { ScmContribution } = require('@theia/scm/lib/browser/scm-contribution');
    const { OutlineViewContribution } = require('@theia/outline-view/lib/browser/outline-view-contribution');
    const { ProblemContribution } = require('@theia/markers/lib/browser/problem/problem-contribution');

    /** @type {import('inversify').Container} */
    const container = window['theia'].container;
    const shell = container.get(ApplicationShell);
    const navigatorContribution = container.get(FileNavigatorContribution);
    const scmContribution = container.get(ScmContribution);
    const outlineContribution = container.get(OutlineViewContribution);
    const problemContribution = container.get(ProblemContribution);

    before(() => {
        shell.leftPanelHandler.collapse();
    });

    for (const contribution of [navigatorContribution, scmContribution, outlineContribution, problemContribution]) {
        it(`should toggle ${contribution.viewLabel}`, async () => {
            let view = await contribution.closeView();
            if (view) {
                assert.notEqual(shell.getAreaFor(view), contribution.defaultViewOptions.area);
                assert.isFalse(view.isVisible);
                assert.notEqual(view, shell.activeWidget);
            }

            view = await contribution.toggleView();
            assert.notEqual(view, undefined);
            assert.equal(shell.getAreaFor(view), contribution.defaultViewOptions.area);
            assert.isDefined(shell.getTabBarFor(view));
            assert.equal(shell.getAreaFor(shell.getTabBarFor(view)), contribution.defaultViewOptions.area);
            assert.isTrue(view.isVisible);
            assert.equal(view, shell.activeWidget);

            view = await contribution.toggleView();
            assert.notEqual(view, undefined);
            assert.equal(shell.getAreaFor(view), contribution.defaultViewOptions.area);
            assert.isDefined(shell.getTabBarFor(view));
            assert.isFalse(view.isVisible);
            assert.notEqual(view, shell.activeWidget);
        });
    }

});
