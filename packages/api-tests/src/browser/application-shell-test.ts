/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import * as assert from 'assert';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { getFrontendApplicationContainer } from '@theia/core/lib/browser/frontend-application-container';

describe('ApplicationShell', function () {

    const container = getFrontendApplicationContainer();
    const shell = container.get(ApplicationShell);

    it('isAttached', () => {
        assert.ok(shell.isAttached);
    });

    it("should show 'Explorer' and 'SCM'", () => {
        assert.ok(false);
        const titles = new Set(shell.leftPanelHandler.tabBar.titles.map(title => title.label));
        titles.has('Explorer');
        titles.has('Source Control');
    });

    describe('files tab', () => {
        it('should open/close the files tab', async () => {
            shell.leftPanelHandler.activate('files');
            await new Promise(resolve => window.requestAnimationFrame(resolve));
            assert.ok(shell.leftPanelHandler.tabBar.currentTitle!.owner.isVisible);

            shell.leftPanelHandler.collapse();
            await new Promise(resolve => window.requestAnimationFrame(resolve));
            // tslint:disable-next-line:no-null-keyword
            assert.deepStrictEqual(shell.leftPanelHandler.tabBar.currentTitle, null);
        });
    });

});
