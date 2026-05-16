// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { Widget } from '@theia/core/shared/@lumino/widgets';
import { injectable, inject, optional } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { MaybePromise } from '@theia/core/lib/common/types';
import { codicon, QuickInputService } from '@theia/core/lib/browser';
import { ApplicationShell } from '@theia/core/lib/browser/shell';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { NavigatableWidget, NavigatableWidgetOpenHandler } from '@theia/core/lib/browser/navigatable';
import { open, OpenerService } from '@theia/core/lib/browser/opener-service';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { MiniBrowserService } from '../common/mini-browser-service';
import { MiniBrowser, MiniBrowserProps } from './mini-browser';
import { LocationMapperService } from './location-mapper-service';
import { nls } from '@theia/core/lib/common/nls';
import { MiniBrowserOpenerOptions } from './mini-browser-opener-options';
import { MiniBrowserOpenHook } from './mini-browser-open-hook';

export namespace MiniBrowserCommands {

    export const PREVIEW_CATEGORY = 'Preview';
    export const PREVIEW_CATEGORY_KEY = nls.getDefaultKey(PREVIEW_CATEGORY);

    export const PREVIEW = Command.toLocalizedCommand({
        id: 'mini-browser.preview',
        label: 'Open Preview',
        iconClass: codicon('open-preview')
    }, 'vscode.markdown-language-features/package/markdown.preview.title');
    export const OPEN_SOURCE: Command = {
        id: 'mini-browser.open.source',
        iconClass: codicon('go-to-file')
    };
    export const OPEN_URL = Command.toDefaultLocalizedCommand({
        id: 'mini-browser.openUrl',
        category: PREVIEW_CATEGORY,
        label: 'Open URL'
    });
}

@injectable()
export class MiniBrowserOpenHandler extends NavigatableWidgetOpenHandler<MiniBrowser>
    implements FrontendApplicationContribution, CommandContribution, MenuContribution, TabBarToolbarContribution {

    static PREVIEW_URI = new URI().withScheme('__minibrowser__preview__');

    protected readonly supportedExtensions: Map<string, number> = new Map();

    readonly id = MiniBrowser.ID;
    readonly label = nls.localize(MiniBrowserCommands.PREVIEW_CATEGORY_KEY, MiniBrowserCommands.PREVIEW_CATEGORY);

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService;

    @inject(MiniBrowserService)
    protected readonly miniBrowserService: MiniBrowserService;

    @inject(LocationMapperService)
    protected readonly locationMapperService: LocationMapperService;

    @inject(MiniBrowserOpenHook)
    protected readonly openHook: MiniBrowserOpenHook;

    onStart(): void {
        this.miniBrowserService.supportedFileExtensions().then(entries => {
            entries.forEach(entry => {
                const { extension, priority } = entry;
                this.supportedExtensions.set(extension, priority);
            });
        });
    }

    canHandle(uri: URI, options?: MiniBrowserOpenerOptions): number {
        const extension = uri.toString().split('.').pop();
        if (!extension) {
            return 0;
        }
        if (options?.openFor === 'source') {
            return -100;
        } else if (options?.openFor === 'preview') {
            return 200;
        } else {
            return this.supportedExtensions.get(extension.toLocaleLowerCase()) || 0;
        }
    }

    override async open(uri: URI, options?: MiniBrowserOpenerOptions): Promise<MiniBrowser> {
        const widget = await super.open(uri, options);
        try {
            this.openHook.afterOpen(widget, options);
        } catch (e) {
            console.error('MiniBrowserOpenHook.afterOpen failed', e);
        }
        const area = this.shell.getAreaFor(widget);
        if (area === 'right' || area === 'left') {
            const panelLayout = area === 'right' ? this.shell.getLayoutData().rightPanel : this.shell.getLayoutData().leftPanel;
            const minSize = this.shell.mainPanel.node.offsetWidth / 2;
            if (panelLayout && panelLayout.size && panelLayout.size <= minSize) {
                requestAnimationFrame(() => this.shell.resize(minSize, area));
            }
        }
        return widget;
    }

    protected override async getOrCreateWidget(uri: URI, options?: MiniBrowserOpenerOptions): Promise<MiniBrowser> {
        const props = await this.options(uri, options);
        const widget = await super.getOrCreateWidget(uri, props);
        widget.setProps(props);
        return widget;
    }

    protected async options(uri?: URI, options?: MiniBrowserOpenerOptions): Promise<MiniBrowserOpenerOptions & { widgetOptions: ApplicationShell.WidgetOptions }> {
        let result = await this.defaultOptions();
        if (uri) {
            const startPage = uri.toString(true);
            const name = this.labelProvider.getName(uri);
            const iconClass = `${this.labelProvider.getIcon(uri)} file-icon`;
            const resetBackground = await this.resetBackground(uri);
            result = {
                ...result,
                startPage,
                name,
                iconClass,
                toolbar: 'hide',
                resetBackground
            };
        }
        if (options) {
            result = {
                ...result,
                ...options
            };
        }
        return result;
    }

    protected resetBackground(uri: URI): MaybePromise<boolean> {
        const { scheme } = uri;
        const uriStr = uri.toString();
        return scheme === 'http'
            || scheme === 'https'
            || (scheme === 'file'
                && (uriStr.endsWith('html') || uriStr.endsWith('.htm'))
            );
    }

    protected async defaultOptions(): Promise<MiniBrowserOpenerOptions & { widgetOptions: ApplicationShell.WidgetOptions }> {
        return {
            mode: 'activate',
            widgetOptions: { area: 'main' },
            sandbox: MiniBrowserProps.SandboxOptions.DEFAULT,
            toolbar: 'show'
        };
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(MiniBrowserCommands.PREVIEW, {
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
            execute: (arg?: string) => this.openUrl(arg)
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(['editor_context_menu', 'navigation'], {
            commandId: MiniBrowserCommands.PREVIEW.id
        });
    }

    registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
        toolbar.registerItem({
            id: MiniBrowserCommands.PREVIEW.id,
            command: MiniBrowserCommands.PREVIEW.id,
            tooltip: nls.localize('vscode.markdown-language-features/package/markdown.previewSide.title', 'Open Preview to the Side')
        });
        toolbar.registerItem({
            id: MiniBrowserCommands.OPEN_SOURCE.id,
            command: MiniBrowserCommands.OPEN_SOURCE.id,
            tooltip: nls.localize('vscode.markdown-language-features/package/markdown.showSource.title', 'Open Source')
        });
    }

    protected canPreviewWidget(widget?: Widget): boolean {
        const uri = this.getUriToPreview(widget);
        return !!uri && !!this.canHandle(uri);
    }

    protected getUriToPreview(widget?: Widget): URI | undefined {
        const current = this.getWidgetToPreview(widget);
        return current && current.getResourceUri();
    }

    protected getWidgetToPreview(widget?: Widget): NavigatableWidget | undefined {
        const current = widget ? widget : this.shell.currentWidget;
        return !(current instanceof MiniBrowser) && NavigatableWidget.is(current) && current || undefined;
    }

    protected async preview(widget?: Widget): Promise<void> {
        const ref = this.getWidgetToPreview(widget);
        if (!ref) {
            return;
        }
        const uri = ref.getResourceUri();
        if (!uri) {
            return;
        }
        await this.open(uri, {
            mode: 'reveal',
            widgetOptions: { ref, mode: 'open-to-right' },
            openFor: 'preview'
        });
    }

    protected async openSource(ref?: Widget): Promise<void> {
        const uri = this.getSourceUri(ref);
        if (uri) {
            await open(this.openerService, uri, {
                widgetOptions: { ref, mode: 'tab-after' },
                openFor: 'source'
            });
        }
    }

    protected getSourceUri(ref?: Widget): URI | undefined {
        const uri = ref instanceof MiniBrowser && ref.getResourceUri() || undefined;
        if (!uri || uri.scheme === 'http' || uri.scheme === 'https' || uri.isEqual(MiniBrowserOpenHandler.PREVIEW_URI)) {
            return undefined;
        }
        return uri;
    }

    protected async openUrl(arg?: string): Promise<void> {
        const url = arg ? arg : await this.quickInputService?.input({
            prompt: nls.localizeByDefault('URL to open'),
            placeHolder: nls.localize('theia/mini-browser/typeUrl', 'Type a URL')
        });
        if (url) {
            await this.openPreview(url);
        }
    }

    async openPreview(startPage: string): Promise<MiniBrowser> {
        const props = await this.getOpenPreviewProps(await this.locationMapperService.map(startPage));
        return this.open(MiniBrowserOpenHandler.PREVIEW_URI, props);
    }

    protected async getOpenPreviewProps(startPage: string): Promise<MiniBrowserOpenerOptions> {
        const resetBackground = await this.resetBackground(new URI(startPage));
        return {
            name: nls.localize(MiniBrowserCommands.PREVIEW_CATEGORY_KEY, MiniBrowserCommands.PREVIEW_CATEGORY),
            startPage,
            toolbar: 'read-only',
            widgetOptions: {
                area: 'right'
            },
            resetBackground,
            iconClass: codicon('preview'),
            openFor: 'preview'
        };
    }

}

export type { MiniBrowserOpenerOptions } from './mini-browser-opener-options';
