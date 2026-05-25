// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { ShellExecutionServerImpl } from '@theia/ai-terminal/lib/node/shell-execution-server-impl';
import { QaapShellExecutionServerImpl } from './qaap-shell-execution-server-impl';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    rebind(ShellExecutionServerImpl).to(QaapShellExecutionServerImpl).inSingletonScope();
});
