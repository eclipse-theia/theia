// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import {
    AbstractStreamParsingChatAgent, ChatMode, ChatSessionContext, SystemMessageDescription
} from '@theia/ai-chat/lib/common';
import { AIVariableContext } from '@theia/ai-core';
import { injectable } from '@theia/core/shared/inversify';

/**
 * An abstract chat agent that supports mode selection for selecting prompt variants.
 *
 * Agents extending this class define their available modes via `modeDefinitions`.
 * The `modes` getter dynamically computes which mode is the default based on the
 * current prompt variant settings. When a request is made with a specific `modeId`,
 * that mode's prompt variant is used instead of the settings-configured default.
 */
@injectable()
export abstract class AbstractModeAwareChatAgent extends AbstractStreamParsingChatAgent {
    /**
     * Mode definitions without the `isDefault` property.
     * Subclasses must provide their specific mode definitions.
     * Each mode's `id` should correspond to a prompt variant ID.
     */
    protected abstract readonly modeDefinitions: Omit<ChatMode, 'isDefault'>[];

    /**
     * The ID of the prompt variant set used for mode selection.
     * Defaults to `systemPromptId`. Override if a different variant set should be used.
     */
    protected get promptVariantSetId(): string | undefined {
        return this.systemPromptId;
    }

    /**
     * Returns the available modes with `isDefault` computed based on current settings.
     */
    get modes(): ChatMode[] {
        const variantSetId = this.promptVariantSetId;
        if (!variantSetId) {
            return this.modeDefinitions.map(mode => ({ ...mode, isDefault: false }));
        }
        const effectiveVariantId = this.promptService.getEffectiveVariantId(variantSetId);
        return this.modeDefinitions.map(mode => ({
            ...mode,
            isDefault: mode.id === effectiveVariantId
        }));
    }

    protected override async getSystemMessageDescription(context: AIVariableContext): Promise<SystemMessageDescription | undefined> {
        if (this.systemPromptId === undefined) {
            return undefined;
        }

        // Check for mode-based override from request
        const modeId = ChatSessionContext.is(context) ? context.request?.request.modeId : undefined;
        const effectiveVariantId = this.getEffectiveVariantIdWithMode(modeId);

        if (!effectiveVariantId) {
            return undefined;
        }

        const isCustomized = this.promptService.getPromptVariantInfo(effectiveVariantId)?.isCustomized ?? false;
        const resolvedPrompt = await this.promptService.getResolvedPromptFragment(effectiveVariantId, undefined, context);
        return resolvedPrompt ? SystemMessageDescription.fromResolvedPromptFragment(resolvedPrompt, effectiveVariantId, isCustomized) : undefined;
    }

    /**
     * Determines the effective variant ID, considering mode override.
     * If modeId is provided and is a valid variant for the prompt set, it takes precedence.
     * Otherwise falls back to settings-based selection.
     */
    protected getEffectiveVariantIdWithMode(modeId?: string): string | undefined {
        const variantSetId = this.promptVariantSetId;
        if (!variantSetId) {
            return undefined;
        }
        if (modeId) {
            const variantIds = this.promptService.getVariantIds(variantSetId);
            if (variantIds.includes(modeId)) {
                return modeId;
            }
        }
        return this.promptService.getEffectiveVariantId(variantSetId);
    }
}
