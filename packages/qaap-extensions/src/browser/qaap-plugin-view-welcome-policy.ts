// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { PluginViewWelcomePolicy } from '@theia/plugin-ext/lib/main/browser/view/plugin-view-welcome-policy';

@injectable()
export class QaapPluginViewWelcomePolicy implements PluginViewWelcomePolicy {
    shouldRegisterExplorerOpenFolderWelcome(): boolean {
        return false;
    }
}
