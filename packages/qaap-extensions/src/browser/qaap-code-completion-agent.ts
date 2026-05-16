// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { CodeCompletionAgentImpl } from '@theia/ai-code-completion/lib/browser/code-completion-agent';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { nls } from '@theia/core/lib/common/nls';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class QaapCodeCompletionAgentImpl extends CodeCompletionAgentImpl {

    override description = nls.localize(
        'theia/ai/completion/agent/description',
        'This agent provides inline code completion in the code editor in {0}.',
        FrontendApplicationConfigProvider.get().applicationName
    );
}
