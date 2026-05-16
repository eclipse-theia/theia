// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { WorkspaceTrustDialog } from '@theia/workspace/lib/browser/workspace-trust-dialog';

export class QaapWorkspaceTrustDialog extends WorkspaceTrustDialog {

    protected override getTrustDevelopmentHostLabel(): string {
        return FrontendApplicationConfigProvider.get().applicationName;
    }
}
