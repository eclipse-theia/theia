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

import * as React from '@theia/core/shared/react';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { ContributionProvider } from '@theia/core';
import { ReactWidget } from '@theia/core/lib/browser';
import { ChatBannerProvider } from './chat-banner-provider';

/**
 * Host widget rendered above the chat content. Collects all {@link ChatBannerProvider}
 * contributions, sorts them by priority (descending), and renders the non-`undefined`
 * banners. Subscribes to each provider's `onDidChange` event for live updates.
 *
 * The widget's outer node has the `chat-banner-host` class. It exposes a CSS hook
 * for hosts to style the banner area; the widget itself ships with no layout
 * opinion beyond stacking entries vertically.
 */
@injectable()
export class ChatBannerWidget extends ReactWidget {

    static readonly ID = 'chat-banner-widget';

    @inject(ContributionProvider) @named(ChatBannerProvider)
    protected readonly bannerProviders: ContributionProvider<ChatBannerProvider>;

    @postConstruct()
    protected init(): void {
        this.id = ChatBannerWidget.ID;
        this.addClass('chat-banner-host');
        for (const provider of this.bannerProviders.getContributions()) {
            if (provider.onDidChange) {
                this.toDispose.push(provider.onDidChange(() => this.update()));
            }
        }
        this.update();
    }

    protected render(): React.ReactNode {
        const providers = this.bannerProviders.getContributions()
            .toSorted((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        const nodes = providers
            .map((p, idx) => {
                const banner = p.renderBanner();
                if (banner === undefined) {
                    return undefined;
                }
                return <React.Fragment key={idx}>{banner}</React.Fragment>;
            })
            .filter((node): node is React.ReactElement => node !== undefined);
        if (nodes.length === 0) {
            return undefined;
        }
        return <>{nodes}</>;
    }
}
