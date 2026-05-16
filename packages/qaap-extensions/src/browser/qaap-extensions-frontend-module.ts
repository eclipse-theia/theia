// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { ShellLayoutTransformer } from '@theia/core/lib/browser/shell/shell-layout-restorer';
import { FileNavigatorWidget } from '@theia/navigator/lib/browser/navigator-widget';
import { FileNavigatorContribution } from '@theia/navigator/lib/browser/navigator-contribution';
import { AIChatContribution } from '@theia/ai-chat-ui/lib/browser/ai-chat-ui-contribution';
import { OutlineViewContribution } from '@theia/outline-view/lib/browser/outline-view-contribution';
import { DebugFrontendContribution } from '@theia/memory-inspector/lib/browser/memory-inspector-frontend-contribution';
import { QaapAiChatMobileContribution } from './qaap-ai-chat-mobile-contribution';
import { QaapOutlineMobileContribution } from './qaap-outline-mobile-contribution';
import { QaapMemoryInspectorMobileContribution } from './qaap-memory-inspector-mobile-contribution';
import { QaapFileNavigatorContribution } from './qaap-file-navigator-contribution';
import { createQaapFileNavigatorWidget } from './qaap-navigator-widget-factory';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(QaapAiChatMobileContribution).toSelf().inSingletonScope();
    rebind(AIChatContribution).toService(QaapAiChatMobileContribution);
    bind(ShellLayoutTransformer).toService(QaapAiChatMobileContribution);

    bind(QaapOutlineMobileContribution).toSelf().inSingletonScope();
    rebind(OutlineViewContribution).toService(QaapOutlineMobileContribution);
    bind(ShellLayoutTransformer).toService(QaapOutlineMobileContribution);

    bind(QaapMemoryInspectorMobileContribution).toSelf().inSingletonScope();
    rebind(DebugFrontendContribution).toService(QaapMemoryInspectorMobileContribution);
    bind(ShellLayoutTransformer).toService(QaapMemoryInspectorMobileContribution);

    rebind(FileNavigatorWidget).toDynamicValue(ctx => createQaapFileNavigatorWidget(ctx.container));

    bind(QaapFileNavigatorContribution).toSelf().inSingletonScope();
    rebind(FileNavigatorContribution).toService(QaapFileNavigatorContribution);
});
