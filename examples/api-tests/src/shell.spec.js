/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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
describe('Shell', function () {

    const { assert } = chai;

    const { ApplicationShell } = require('@theia/core/lib/browser/shell/application-shell');
    const { StatusBarImpl } = require('@theia/core/lib/browser/status-bar');

    const container = window.theia.container;
    const shell = container.get(ApplicationShell);
    const statusBar = container.get(StatusBarImpl);

    it('should be shown', () => {
        assert.isTrue(shell.isAttached && shell.isVisible);
    });

    it('should show the main content panel', () => {
        assert.isTrue(shell.mainPanel.isAttached && shell.mainPanel.isVisible);
    });

    it('should show the status bar', () => {
        assert.isTrue(statusBar.isAttached && statusBar.isVisible);
    });

});
