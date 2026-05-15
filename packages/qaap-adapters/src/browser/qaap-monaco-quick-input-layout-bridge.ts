// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationShell } from '@theia/core/lib/browser/shell';
import { DefaultMonacoQuickInputLayout } from '@theia/monaco/lib/browser/monaco-quick-input-layout';
import { QaapMonacoQuickInputAdapter } from './qaap-monaco-quick-input-adapter';

@injectable()
export class QaapMonacoQuickInputLayoutBridge extends DefaultMonacoQuickInputLayout {

    @inject(QaapMonacoQuickInputAdapter)
    protected readonly adapter: QaapMonacoQuickInputAdapter;

    override synchronize(shell: ApplicationShell, container: HTMLElement): void {
        this.adapter.synchronize(shell, container, () => super.synchronize(shell, container));
    }
}
