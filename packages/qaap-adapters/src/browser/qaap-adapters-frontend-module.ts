// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { MiniBrowserOpenHook } from '@theia/mini-browser/lib/browser/mini-browser-open-hook';
import { MonacoQuickInputLayout } from '@theia/monaco/lib/browser/monaco-quick-input-layout';
import { DefaultQaapMiniBrowserLifecycle } from './default-qaap-mini-browser-lifecycle';
import { DefaultQaapMonacoQuickInputAdapter } from './default-qaap-monaco-quick-input-adapter';
import { QaapMiniBrowserLifecycle } from './qaap-mini-browser-lifecycle';
import { QaapMiniBrowserOpenHookBridge } from './qaap-mini-browser-open-hook-bridge';
import { QaapMonacoQuickInputAdapter } from './qaap-monaco-quick-input-adapter';
import { QaapMonacoQuickInputLayoutBridge } from './qaap-monaco-quick-input-layout-bridge';

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(DefaultQaapMiniBrowserLifecycle).toSelf().inSingletonScope();
    bind(QaapMiniBrowserLifecycle).toService(DefaultQaapMiniBrowserLifecycle);
    bind(DefaultQaapMonacoQuickInputAdapter).toSelf().inSingletonScope();
    bind(QaapMonacoQuickInputAdapter).toService(DefaultQaapMonacoQuickInputAdapter);

    bind(QaapMiniBrowserOpenHookBridge).toSelf().inSingletonScope();
    bind(QaapMonacoQuickInputLayoutBridge).toSelf().inSingletonScope();

    if (isBound(MiniBrowserOpenHook)) {
        rebind(MiniBrowserOpenHook).to(QaapMiniBrowserOpenHookBridge).inSingletonScope();
    }
    if (isBound(MonacoQuickInputLayout)) {
        rebind(MonacoQuickInputLayout).to(QaapMonacoQuickInputLayoutBridge).inSingletonScope();
    }
});
