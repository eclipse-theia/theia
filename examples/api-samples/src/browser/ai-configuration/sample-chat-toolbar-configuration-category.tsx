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

import { Emitter, Event, nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { DisposableCollection } from '@theia/core/lib/common';
import { inject, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import {
    AiConfigurationCategory,
    AiConfigurationRenderContext,
    AiConfigurationSearchItem,
    AiConfigurationSearchProvider
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { SinglePageCategoryRenderer } from '@theia/ai-core-ui/lib/browser/ai-configuration/renderers/single-page-category-renderer';
import { AiConfigurationSection } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-primitives';
import { AiSettingsRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { SAMPLE_CHAT_NODE_TOOLBAR_ENABLED_PREF } from '../chat/sample-chat-node-toolbar-preferences';

/**
 * Sample `single-page` AI configuration category contributed by `@theia/api-samples`. It sets
 * `contributed: true`, so it appears under "Contributed by extensions" in the AI Configuration view, and it
 * surfaces the {@link SAMPLE_CHAT_NODE_TOOLBAR_ENABLED_PREF} setting that gates the sample chat-response
 * action button — so toggling it here has a real, observable effect on the chat UI. It uses only the public
 * {@link AiConfigurationCategory} contribution point and the shared primitives, proving an extension can add a
 * category with no privileged access, render like the built-ins, and participate in deep search.
 */
@injectable()
export class SampleChatToolbarConfigurationCategory extends SinglePageCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = 'sample-extension';
    readonly label = nls.localize('theia/api-samples/sampleExtension/label', 'API Samples');
    readonly description = nls.localize('theia/api-samples/sampleExtension/description',
        'Example settings contributed by the @theia/api-samples extension.');
    readonly iconClass = codicon('lightbulb');
    readonly kind = 'single-page' as const;
    readonly contributed = true;

    @inject(AiSettingsRowService)
    protected readonly settingsRowService: AiSettingsRowService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    get renderer(): this {
        return this;
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.settingsRowService.onPreferenceChanged(() => this.onDidChangeEmitter.fire()));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected renderSections(ctx: AiConfigurationRenderContext): React.ReactNode {
        return <AiConfigurationSection title={nls.localizeByDefault('Chat')}>
            <AiSettingsRow
                service={this.settingsRowService}
                preferenceId={SAMPLE_CHAT_NODE_TOOLBAR_ENABLED_PREF}
                scope={ctx.scope}
                control={{ type: 'boolean' }}
                onDidChange={ctx.update}
            />
        </AiConfigurationSection>;
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const described = this.settingsRowService.describe(SAMPLE_CHAT_NODE_TOOLBAR_ENABLED_PREF);
        return [{
            label: described.label ?? SAMPLE_CHAT_NODE_TOOLBAR_ENABLED_PREF,
            typeLabel: nls.localizeByDefault('Setting'),
            categoryId: this.id,
            target: { categoryId: this.id, highlight: { rowId: SAMPLE_CHAT_NODE_TOOLBAR_ENABLED_PREF } },
            keywords: SAMPLE_CHAT_NODE_TOOLBAR_ENABLED_PREF
        }];
    }
}

export function bindSampleChatToolbarConfigurationCategory(bind: interfaces.Bind): void {
    bind(SampleChatToolbarConfigurationCategory).toSelf().inSingletonScope();
    bind(AiConfigurationCategory).toService(SampleChatToolbarConfigurationCategory);
}
