// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import URI from '@theia/core/lib/common/uri';
import { injectable } from '@theia/core/shared/inversify';
import { AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';

/**
 * AIChatInputWidget variant used by the mobile Projects panel.
 *
 * The vanilla {@link AIChatInputWidget} hard-codes its `resources.add(...)` URI to
 * `ai-chat:/input.aichatviewlanguage`. The workspace Agent AI view already registers an
 * AIChatInputWidget with that key, so any second instance constructed in the same process
 * throws "Cannot add already existing in-memory resource" inside `postConstruct` — which we
 * traced as the cause of the empty agent-input card the user kept hitting when expanding the
 * tune button in a project row.
 *
 * Overriding {@link getResourceUri} with a per-instance unique URI removes the collision
 * without touching the upstream widget. Everything else (mode picker, capability chips, tools
 * toggle, model selector, React render tree) is inherited verbatim so the chrome the user sees
 * in the project card is identical to the workspace ChatView.
 */
@injectable()
export class MobileProjectAIChatInputWidget extends AIChatInputWidget {

    private static instanceCounter = 0;
    private readonly mobileInstanceSeq = ++MobileProjectAIChatInputWidget.instanceCounter;

    protected override getResourceUri(): URI {
        return new URI(`ai-chat:/mobile-projects-input-${this.mobileInstanceSeq}.aichatviewlanguage`);
    }
}
