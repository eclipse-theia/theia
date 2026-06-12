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

import { Command } from '@theia/core';

export type CommitMessageScope = 'staged' | 'all';

export namespace CommitMessageCommands {
    export const GENERATE_FROM_STAGED: Command = Command.toLocalizedCommand({
        id: 'ai-ide.commit-message.generate-from-staged',
        category: 'AI',
        label: 'Generate Commit Message from Staged Changes'
    }, 'theia/ai-ide/commit-message/generate-from-staged');

    export const GENERATE_FROM_ALL: Command = Command.toLocalizedCommand({
        id: 'ai-ide.commit-message.generate-from-all',
        category: 'AI',
        label: 'Generate Commit Message from All Changes'
    }, 'theia/ai-ide/commit-message/generate-from-all');
}
