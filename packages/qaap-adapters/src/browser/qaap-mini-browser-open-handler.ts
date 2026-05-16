// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { codicon } from '@theia/core/lib/browser';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { MessageService } from '@theia/core/lib/common/message-service';
import { nls } from '@theia/core/lib/common/nls';
import { MOBILE_ONE_COLUMN_LAYOUT_CLASS } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { MiniBrowser } from '@theia/mini-browser/lib/browser/mini-browser';
import { MiniBrowserOpenHandler, MiniBrowserCommands } from '@theia/mini-browser/lib/browser/mini-browser-open-handler';
import { MiniBrowserOpenerOptions } from '@theia/mini-browser/lib/browser/mini-browser-opener-options';
import { normalizeMiniBrowserOpenUrl } from '@theia/mini-browser/lib/browser/mini-browser-url-utils';

/**
 * Qaap mobile / URL preview behavior for mini-browser open handler.
 */
@injectable()
export class QaapMiniBrowserOpenHandler extends MiniBrowserOpenHandler {

    @inject(MessageService)
    protected readonly messages: MessageService;

    override registerCommands(commands: CommandRegistry): void {
        commands.registerCommand({
            ...MiniBrowserCommands.PREVIEW,
            iconClass: codicon('play')
        }, {
            execute: widget => this.preview(widget),
            isEnabled: widget => this.canPreviewWidget(widget),
            isVisible: widget => this.canPreviewWidget(widget)
        });
        commands.registerCommand(MiniBrowserCommands.OPEN_SOURCE, {
            execute: widget => this.openSource(widget),
            isEnabled: widget => !!this.getSourceUri(widget),
            isVisible: widget => !!this.getSourceUri(widget)
        });
        commands.registerCommand(MiniBrowserCommands.OPEN_URL, {
            execute: (...args: unknown[]) => this.openUrl(this.coerceUrlCommandArg(args))
        });
    }

    protected coerceUrlCommandArg(args: unknown[]): string | undefined {
        for (const arg of args) {
            if (typeof arg === 'string') {
                const t = normalizeMiniBrowserOpenUrl(arg);
                if (t) {
                    return t;
                }
            }
        }
        return undefined;
    }

    protected override async openUrl(urlFromCommand?: string): Promise<void> {
        let url = urlFromCommand ? normalizeMiniBrowserOpenUrl(urlFromCommand) : '';
        if (!url) {
            if (this.quickInputService) {
                const raw = await this.quickInputService.input({
                    prompt: nls.localizeByDefault('URL to open'),
                    placeHolder: nls.localize('theia/mini-browser/typeUrl', 'Type a URL'),
                    ignoreFocusLost: true
                });
                url = raw ? normalizeMiniBrowserOpenUrl(raw) : '';
            } else {
                this.messages.warn(nls.localize(
                    'theia/mini-browser/quickInputUnavailable',
                    'Cannot prompt for a URL because quick input is not available. Open the Preview from the editor toolbar or configure Quick Input.'
                ));
                return;
            }
        }
        if (!url) {
            return;
        }
        await this.openPreviewForProduct(url);
    }

    protected async openPreviewForProduct(startPage: string): Promise<MiniBrowser | undefined> {
        const trimmed = normalizeMiniBrowserOpenUrl(startPage);
        if (!trimmed) {
            this.messages.warn(nls.localize('theia/mini-browser/emptyUrl', 'Please enter a URL.'));
            return undefined;
        }
        let mapped: string;
        try {
            mapped = await this.locationMapperService.map(trimmed);
        } catch (err) {
            this.messages.error(nls.localize(
                'theia/mini-browser/urlMapFailed',
                'Could not resolve that URL: {0}',
                String(err)
            ));
            return undefined;
        }
        const props = await this.getOpenPreviewProps(mapped);
        return this.open(MiniBrowserOpenHandler.PREVIEW_URI, props);
    }

    protected override async getOpenPreviewProps(startPage: string): Promise<MiniBrowserOpenerOptions> {
        let resetBackground = false;
        try {
            resetBackground = await this.resetBackground(new URI(startPage));
        } catch {
            resetBackground = startPage.startsWith('http://') || startPage.startsWith('https://');
        }
        return {
            name: nls.localize(MiniBrowserCommands.PREVIEW_CATEGORY_KEY, MiniBrowserCommands.PREVIEW_CATEGORY),
            startPage,
            toolbar: 'show',
            widgetOptions: {
                area: this.isMobileOneColumn() ? 'main' : 'right'
            },
            resetBackground,
            iconClass: codicon('preview'),
            openFor: 'preview'
        };
    }

    protected isMobileOneColumn(): boolean {
        if (typeof document === 'undefined') {
            return false;
        }
        const shellNode = document.getElementById('theia-app-shell');
        return !!shellNode?.classList.contains(MOBILE_ONE_COLUMN_LAYOUT_CLASS);
    }
}
