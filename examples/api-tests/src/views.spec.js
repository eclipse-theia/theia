// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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

const { timeout } = require('@theia/core/lib/common/promise-util');

// @ts-check
describe('Views', function () {
    this.timeout(7500);

    const { assert } = chai;

    const { ApplicationShell } = require('@theia/core/lib/browser/shell/application-shell');
    const { FileNavigatorContribution } = require('@theia/navigator/lib/browser/navigator-contribution');
    const { ScmContribution } = require('@theia/scm/lib/browser/scm-contribution');
    const { OutlineViewContribution } = require('@theia/outline-view/lib/browser/outline-view-contribution');
    const { ProblemContribution } = require('@theia/markers/lib/browser/problem/problem-contribution');
    const { PropertyViewContribution } = require('@theia/property-view/lib/browser/property-view-contribution');
    const { HostedPluginSupport } = require('@theia/plugin-ext/lib/hosted/browser/hosted-plugin');

    /** @type {import('inversify').Container} */
    const container = window['theia'].container;
    const shell = container.get(ApplicationShell);
    const navigatorContribution = container.get(FileNavigatorContribution);
    const scmContribution = container.get(ScmContribution);
    const outlineContribution = container.get(OutlineViewContribution);
    const problemContribution = container.get(ProblemContribution);
    const propertyViewContribution = container.get(PropertyViewContribution);
    const pluginService = container.get(HostedPluginSupport);

    before(() => Promise.all([
        shell.leftPanelHandler.collapse(),
        (async function () {
            await pluginService.didStart;
            await pluginService.activateByViewContainer('explorer');
        })()
    ]));

    for (const contribution of [navigatorContribution, scmContribution, outlineContribution, problemContribution, propertyViewContribution]) {
        it(`should toggle ${contribution.viewLabel}`, async function () {
            let view = await contribution.closeView();
            if (view) {
                assert.notEqual(shell.getAreaFor(view), contribution.defaultViewOptions.area);
                assert.isFalse(view.isVisible);
                assert.isTrue(view !== shell.activeWidget, `${contribution.viewLabel} !== shell.activeWidget`);
            }

            view = await contribution.toggleView();
            // we can't use "equals" here because Mocha chokes on the diff for certain widgets
            assert.isTrue(view !== undefined, `${contribution.viewLabel}  !== undefined`);
            assert.equal(shell.getAreaFor(view), contribution.defaultViewOptions.area);
            assert.isDefined(shell.getTabBarFor(view));
            // @ts-ignore
            assert.equal(shell.getAreaFor(shell.getTabBarFor(view)), contribution.defaultViewOptions.area);
            assert.isTrue(view.isVisible);
            assert.isTrue(view === shell.activeWidget, `${contribution.viewLabel}  === shell.activeWidget`);

            view = await contribution.toggleView();
            await timeout(0); // seems that the "await" is not enought to guarantee that the panel is hidden
            assert.notEqual(view, undefined);
            assert.equal(shell.getAreaFor(view), contribution.defaultViewOptions.area);
            assert.isDefined(shell.getTabBarFor(view));
            assert.isFalse(view.isVisible);
            assert.isTrue(view !== shell.activeWidget, `${contribution.viewLabel}  !== shell.activeWidget`);
        });
    }

});
