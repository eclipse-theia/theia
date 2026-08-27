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

import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { CommandService, nls } from '@theia/core';
import { AI_CONFIGURATION_OPEN_PREFERENCE_ID } from '@theia/ai-core/lib/browser';
import { PreferenceLeafNodeRenderer, PreferenceNodeRenderer } from '@theia/preferences/lib/browser/views/components/preference-node-renderer';
import { PreferenceLeafNodeRendererContribution } from '@theia/preferences/lib/browser/views/components/preference-node-renderer-creator';
import { Preference } from '@theia/preferences/lib/browser/util/preference-types';
import { OPEN_AI_CONFIG_VIEW } from './ai-configuration-view-contribution';

/**
 * Renders the {@link AI_CONFIGURATION_OPEN_PREFERENCE_ID} placeholder (shown where the AI
 * preferences used to live in the Settings UI) as a button that opens the AI Configuration view.
 */
@injectable()
export class AiConfigurationOpenPreferenceRenderer extends PreferenceLeafNodeRenderer<null, HTMLElement> {

    @inject(CommandService)
    protected readonly commandService: CommandService;

    protected createInteractable(container: HTMLElement): void {
        const button = document.createElement('button');
        button.classList.add('theia-button', 'main');
        button.textContent = nls.localize('theia/ai/ide/aiConfiguration/openButton', 'Open AI Configuration');
        button.onclick = () => this.commandService.executeCommand(OPEN_AI_CONFIG_VIEW.id);
        this.interactable = button;
        container.appendChild(button);
    }

    protected getFallbackValue(): null {
        // eslint-disable-next-line no-null/no-null
        return null;
    }

    protected doHandleValueChange(): void { }
}

@injectable()
export class AiConfigurationOpenPreferenceRendererContribution extends PreferenceLeafNodeRendererContribution {
    static ID = 'ai-configuration-open-preference-renderer';
    id = AiConfigurationOpenPreferenceRendererContribution.ID;

    canHandleLeafNode(node: Preference.LeafNode): number {
        return node.preferenceId === AI_CONFIGURATION_OPEN_PREFERENCE_ID ? 100 : 0;
    }

    createLeafNodeRenderer(container: interfaces.Container): PreferenceNodeRenderer {
        return container.get(AiConfigurationOpenPreferenceRenderer);
    }
}
