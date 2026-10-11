// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { nls } from '@theia/core';
import { ConfirmDialog } from '@theia/core/lib/browser';
import { isCustomizedPromptFragment, PromptService } from '@theia/ai-core/lib/common/prompt-service';

/**
 * The two ways to undo a customized prompt fragment, shared by every page that offers them (the agent
 * detail's prompt variant sets and the Prompt Snippets list).
 *
 * Which one applies depends on whether a built-in exists: `resetToBuiltIn` deliberately does nothing for a
 * fragment that has none — a user-authored file such as a custom prompt variant — so those must be deleted
 * instead. Offering reset there is a dead button, which is exactly what this namespace exists to prevent.
 */
export namespace PromptCustomizationDialogs {

    /**
     * Whether a built-in fragment stands behind `fragmentId`, i.e. whether resetting has anything to fall
     * back to. `false` for a fragment that only exists as a user or workspace file.
     */
    export function hasBuiltIn(promptService: PromptService, fragmentId: string): boolean {
        const fragments = promptService.getAllPromptFragments().get(fragmentId) ?? [];
        return fragments.some(fragment => !isCustomizedPromptFragment(fragment));
    }

    export interface RemoveOptions {
        readonly title: string;
        /**
         * Builds the confirmation text. `type` is where the customization lives (e.g. "Prompt Templates
         * Folder") and `description` identifies it concretely (e.g. the file URI); either can be unavailable.
         */
        readonly message: (details: { type?: string; description?: string }) => string;
    }

    /**
     * Asks for confirmation — naming where the customization lives, so the user can see which file is about
     * to go — and then deletes it. Resolves to `true` when it was removed.
     */
    export async function confirmAndRemove(promptService: PromptService, fragmentId: string, options: RemoveOptions): Promise<boolean> {
        const fragment = promptService.getRawPromptFragment(fragmentId);
        if (!fragment || !isCustomizedPromptFragment(fragment)) {
            return false;
        }
        const [type, description] = await Promise.all([
            promptService.getCustomizationType(fragmentId, fragment.customizationId),
            promptService.getCustomizationDescription(fragmentId, fragment.customizationId)
        ]);
        const dialog = new ConfirmDialog({
            title: options.title,
            msg: options.message({ type, description }),
            ok: nls.localizeByDefault('Remove'),
            cancel: nls.localizeByDefault('Cancel')
        });
        if (await dialog.open()) {
            await promptService.removeCustomization(fragmentId, fragment.customizationId);
            return true;
        }
        return false;
    }

    /** Asks for confirmation and then drops every customization, so the built-in text applies again. */
    export async function confirmAndReset(promptService: PromptService, fragmentId: string, title: string, message: string): Promise<boolean> {
        const dialog = new ConfirmDialog({
            title,
            msg: message,
            ok: nls.localizeByDefault('Reset'),
            cancel: nls.localizeByDefault('Cancel')
        });
        if (await dialog.open()) {
            await promptService.resetToBuiltIn(fragmentId);
            return true;
        }
        return false;
    }
}
