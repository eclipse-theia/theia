// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { injectable } from '@theia/core/shared/inversify';
import { nls } from '@theia/core';
import { LanguageModel } from '@theia/ai-core/lib/common';
import { LanguageModelOptionContribution, LanguageModelOptionDecoration } from '@theia/ai-ide/lib/browser/ai-configuration/language-model-option-contribution';
import { isFreeNvidiaModelId } from '@theia/qaap-ai-nvidia/lib/common';
import { isFreeOpenRouterModelId } from '@theia/qaap-ai-openrouter/lib/common';

@injectable()
export class QaapLanguageModelOptionContribution implements LanguageModelOptionContribution {
    decorateLanguageModelOption(model: Pick<LanguageModel, 'id'>): LanguageModelOptionDecoration | undefined {
        if (!isFreeNvidiaModelId(model.id) && !isFreeOpenRouterModelId(model.id)) {
            return undefined;
        }
        const badgeLabel = nls.localize('theia/qaap/ai/core/languageModelRenderer/freeModelBadge', 'Free');
        const title = nls.localize('theia/qaap/ai/core/languageModelRenderer/freeModelTooltip',
            'Free-tier model — NVIDIA NIM (build.nvidia.com) or OpenRouter (slug ending with `:free`). Usable at no cost with a free provider account.');
        return {
            labelSuffix: `  🆓 ${badgeLabel}`,
            title,
            inlineBadge: <span className="ai-model-free-badge" title={title}>🆓 {badgeLabel}</span>
        };
    }
}
