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
import { WidgetOpenerOptions } from '@theia/core/lib/browser/widget-open-handler';
import { MiniBrowserService } from '../common/mini-browser-service';
import { MiniBrowser, MiniBrowserProps } from './mini-browser';
import { LocationMapperService } from './location-mapper-service';
import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import { MOBILE_ONE_COLUMN_LAYOUT_CLASS } from '@theia/core/lib/browser/shell/mobile-layout-state';

export namespace MiniBrowserCommands {

    export const PREVIEW_CATEGORY = 'Preview';
    export const PREVIEW_CATEGORY_KEY = nls.getDefaultKey(PREVIEW_CATEGORY);

    export const PREVIEW = Command.toLocalizedCommand({
        id: 'mini-browser.preview',
        label: 'Open Preview',
        iconClass: codicon('play')
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

/**
 * Further options for opening a new `Mini Browser` widget.
 */
export interface MiniBrowserOpenerOptions extends WidgetOpenerOptions, MiniBrowserProps {
    /**
     * Controls how the mini-browser widget should be opened.
     * - `source`: editable source.
     * - `preview`: rendered content of the source.
     */
    openFor?: 'source' | 'preview';
}

@injectable()
export class MiniBrowserOpenHandler extends NavigatableWidgetOpenHandler<MiniBrowser>
    implements FrontendApplicationContribution, CommandContribution, MenuContribution, TabBarToolbarContribution {

    static PREVIEW_URI = new URI().withScheme('__minibrowser__preview__');

    /**
     * Instead of going to the backend with each file URI to ask whether it can handle the current file or not,
     * we have this map of extension and priority pairs that we populate at application startup.
     * The real advantage of this approach is the following: [Lumino cannot run async code when invoking `isEnabled`/`isVisible`
     * for the command handlers](https://github.com/eclipse-theia/theia/issues/1958#issuecomment-392829371)
     * so the menu item would be always visible for the user even if the file type cannot be handled eventually.
     * Hopefully, we could get rid of this hack once we have migrated the existing Lumino code to [React](https://github.com/eclipse-theia/theia/issues/1915).
     */
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

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(LocationMapperService)
    protected readonly locationMapperService: LocationMapperService;

    onStart(): void {
        this.miniBrowserService.supportedFileExtensions().then(entries => {
            entries.forEach(entry => {
                const { extension, priority } = entry;
                this.supportedExtensions.set(extension, priority);
            });
        });
    }

    canHandle(uri: URI, options?: MiniBrowserOpenerOptions): number {
        // It does not guard against directories. For instance, a folder with this name: `Hahahah.html`.
        // We could check with the FS, but then, this method would become async again.
        const extension = uri.toString().split('.').pop();
        if (!extension) {
            return 0;
        }
        if (options?.openFor === 'source') {
            return -100;
        } else if (options?.openFor === 'preview') {
            return 200; // higher than that of the editor.
        } else {
            return this.supportedExtensions.get(extension.toLocaleLowerCase()) || 0;
        }
    }

    override async open(uri: URI, options?: MiniBrowserOpenerOptions): Promise<MiniBrowser> {
        const widget = await super.open(uri, options);
        try {
            this.schedulePostShellNavigation(widget, options);
        } catch (e) {
            console.error('MiniBrowserOpenHandler.schedulePostShellNavigation failed', e);
        }
        try {
            const area = this.shell.getAreaFor(widget);
            if (area === 'right' || area === 'left') {
                const panelLayout = area === 'right' ? this.shell.getLayoutData().rightPanel : this.shell.getLayoutData().leftPanel;
                const minSize = this.shell.mainPanel.node.offsetWidth / 2;
                if (panelLayout && panelLayout.size && panelLayout.size <= minSize) {
                    requestAnimationFrame(() => this.shell.resize(minSize, area));
                }
            }
        } catch (e) {
            console.error('MiniBrowserOpenHandler.open side-panel resize failed', e);
        }
        return widget;
    }

    /**
     * After `ApplicationShell#addWidget` the preview often still has 0×0 geometry; Quick Input flows are
     * especially sensitive. Re-run `go()` on the next frames and again after layout settles.
     */
    protected schedulePostShellNavigation(widget: MiniBrowser, options?: MiniBrowserOpenerOptions): void {
        const startPage = typeof options?.startPage === 'string' ? MiniBrowserOpenHandler.normalizeUrlInput(options.startPage) : '';
        if (!startPage) {
            return;
        }
        const bump = (): void => {
            const layout = widget.layout as { widgets?: ReadonlyArray<{ isDisposed?: boolean }> };
            const widgets = layout.widgets;
            if (!widgets?.length) {
                return;
            }
            const content = widgets[0];
            if (!content || content.isDisposed) {
                return;
            }
            const forceNavigate = (content as { forceNavigate?: (u: string) => Promise<void> }).forceNavigate;
            if (typeof forceNavigate === 'function') {
                void forceNavigate.call(content, startPage);
            }
        };
        window.requestAnimationFrame(() => window.requestAnimationFrame(bump));
        window.setTimeout(bump, 300);
    }

    protected static normalizeUrlInput(url: string): string {
        return url.replace(/\u00a0/g, ' ').trim();
    }

    protected override async getOrCreateWidget(uri: URI, options?: MiniBrowserOpenerOptions): Promise<MiniBrowser> {
        const props = await this.options(uri, options);
        const widget = await super.getOrCreateWidget(uri, props);
        widget.setProps(props);
        return widget;
    }

    protected async options(uri?: URI, options?: MiniBrowserOpenerOptions): Promise<MiniBrowserOpenerOptions & { widgetOptions: ApplicationShell.WidgetOptions }> {
        // Get the default options.
        let result = await this.defaultOptions();
        if (uri) {
            // Decorate it with a few properties inferred from the URI.
            const startPage = uri.toString(true);
            const name = this.labelProvider.getName(uri);
            const iconClass = `${this.labelProvider.getIcon(uri)} file-icon`;
            // The background has to be reset to white only for "real" web-pages but not for images, for instance.
            const resetBackground = await this.resetBackground(uri);
            result = {
                ...result,
                startPage,
                name,
                iconClass,
                // Make sure the toolbar is not visible. We have the `iframe.src` anyway.
                toolbar: 'hide',
                resetBackground
            };
        }
        if (options) {
            // Explicit options overrule everything.
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
            execute: (...args: unknown[]) => this.openUrl(this.coerceUrlCommandArg(args))
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
        // MiniBrowser is NavigatableWidget and should be excluded from widgets to preview
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

    /**
     * Command handlers may receive non-string arguments (e.g. widget context); only a string is a URL.
     */
    protected coerceUrlCommandArg(args: unknown[]): string | undefined {
        for (const arg of args) {
            if (typeof arg === 'string') {
                const t = MiniBrowserOpenHandler.normalizeUrlInput(arg);
                if (t) {
                    return t;
                }
            }
        }
        return undefined;
    }

    protected async openUrl(urlFromCommand?: string): Promise<void> {
        let url = urlFromCommand ? MiniBrowserOpenHandler.normalizeUrlInput(urlFromCommand) : '';
        if (!url) {
            if (this.quickInputService) {
                const raw = await this.quickInputService.input({
                    prompt: nls.localizeByDefault('URL to open'),
                    placeHolder: nls.localize('theia/mini-browser/typeUrl', 'Type a URL'),
                    /* Keep the prompt open when focus briefly leaves (mobile bottom bar, Welcome, shell layout). */
                    ignoreFocusLost: true
                });
                url = raw ? MiniBrowserOpenHandler.normalizeUrlInput(raw) : '';
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
        await this.openPreview(url);
    }

    async openPreview(startPage: string): Promise<MiniBrowser | undefined> {
        const trimmed = MiniBrowserOpenHandler.normalizeUrlInput(startPage);
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

    protected async getOpenPreviewProps(startPage: string): Promise<MiniBrowserOpenerOptions> {
        let resetBackground = false;
        try {
            resetBackground = await this.resetBackground(new URI(startPage));
        } catch {
            resetBackground = startPage.startsWith('http://') || startPage.startsWith('https://');
        }
        return {
            name: nls.localize(MiniBrowserCommands.PREVIEW_CATEGORY_KEY, MiniBrowserCommands.PREVIEW_CATEGORY),
            startPage,
            // Use the editable toolbar so the address bar can be modified inline (Enter navigates to
            // the new URL). The dedicated "Open In A New Window" button still handles opening the
            // current page externally, making the read-only click-to-open behaviour redundant.
            toolbar: 'show',
            // On mobile (one-column shell, see MOBILE_ONE_COLUMN_LAYOUT_CLASS), the right-side panel is shown
            // as a sheet and is not the right place for a fullscreen browser preview. Open the preview
            // in the main editor area instead so it inherits the full device width.
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
