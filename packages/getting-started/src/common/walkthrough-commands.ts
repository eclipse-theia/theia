// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { Command } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';

export namespace WalkthroughCommands {
    export const OPEN_WALKTHROUGH = Command.toDefaultLocalizedCommand({
        id: 'walkthrough.open',
        category: 'Help',
        label: 'Open Walkthrough...'
    });
    /**
     * VS Code's id for opening a walkthrough, registered as an alias of {@link OPEN_WALKTHROUGH}.
     * Walkthroughs link to it from their step descriptions.
     */
    export const OPEN_WALKTHROUGH_VSCODE: Command = {
        id: 'workbench.action.openWalkthrough'
    };
    export const RESET_WALKTHROUGH_PROGRESS = Command.toLocalizedCommand({
        id: 'walkthrough.resetProgress',
        category: 'Help',
        label: 'Reset Walkthrough Progress'
    }, 'theia/getting-started/resetWalkthroughProgress', nls.getDefaultKey('Help'));
}
