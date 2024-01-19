// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { nls } from '@theia/core/lib/common/nls';
import { codicon } from '@theia/core/lib/browser';
import { Command } from '@theia/core/lib/common';

export namespace VSXExtensionsCommands {

    const EXTENSIONS_CATEGORY = 'Extensions';

    export const CLEAR_ALL = Command.toDefaultLocalizedCommand({
        id: 'vsxExtensions.clearAll',
        category: EXTENSIONS_CATEGORY,
        label: 'Clear Search Results',
        iconClass: codicon('clear-all')
    });
    export const INSTALL_FROM_VSIX: Command & { dialogLabel: string } = {
        id: 'vsxExtensions.installFromVSIX',
        category: nls.localizeByDefault(EXTENSIONS_CATEGORY),
        originalCategory: EXTENSIONS_CATEGORY,
        originalLabel: 'Install from VSIX...',
        label: nls.localizeByDefault('Install from VSIX') + '...',
        dialogLabel: nls.localizeByDefault('Install from VSIX')
    };
    export const INSTALL_VSIX_FILE: Command = Command.toDefaultLocalizedCommand({
        id: 'vsxExtensions.installVSIX',
        label: 'Install Extension VSIX',
        category: EXTENSIONS_CATEGORY,
    });
    export const INSTALL_ANOTHER_VERSION: Command = {
        id: 'vsxExtensions.installAnotherVersion'
    };
    export const COPY: Command = {
        id: 'vsxExtensions.copy'
    };
    export const COPY_EXTENSION_ID: Command = {
        id: 'vsxExtensions.copyExtensionId'
    };
    export const SHOW_BUILTINS = Command.toDefaultLocalizedCommand({
        id: 'vsxExtension.showBuiltins',
        label: 'Show Built-in Extensions',
        category: EXTENSIONS_CATEGORY,
    });
    export const SHOW_INSTALLED = Command.toLocalizedCommand({
        id: 'vsxExtension.showInstalled',
        label: 'Show Installed Extensions',
        category: EXTENSIONS_CATEGORY,
    }, 'theia/vsx-registry/showInstalled');
    export const SHOW_RECOMMENDATIONS = Command.toDefaultLocalizedCommand({
        id: 'vsxExtension.showRecommendations',
        label: 'Show Recommended Extensions',
        category: EXTENSIONS_CATEGORY,
    });
}
