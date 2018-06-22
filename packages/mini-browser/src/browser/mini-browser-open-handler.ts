/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { MaybePromise } from '@theia/core/lib/common/types';
import { ApplicationShell } from '@theia/core/lib/browser/shell';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application';
import { WidgetOpenHandler, WidgetOpenerOptions } from '@theia/core/lib/browser/widget-open-handler';
import { MiniBrowserService } from '../common/mini-browser-service';
import { MiniBrowser, MiniBrowserProps } from './mini-browser';

/**
 * Further options for opening a new `Mini Browser` widget.
 */
export interface MiniBrowserOpenerOptions extends WidgetOpenerOptions, MiniBrowserProps {

}

@injectable()
export class MiniBrowserOpenHandler extends WidgetOpenHandler<MiniBrowser> implements FrontendApplicationContribution {

    /**
     * Instead of going to the backend with each file URI to ask whether it can handle the current file or not,
     * we have this map of extension and priority pairs that we populate at application startup.
     * The real advantage of this approach is the following: [Phosphor cannot run async code when invoking `isEnabled`/`isVisible`
     * for the command handlers](https://github.com/theia-ide/theia/issues/1958#issuecomment-392829371)
     * so the menu item would be always visible for the user even if the file type cannot be handled eventually.
     * Hopefully, we could get rid of this hack once we have migrated the existing Phosphor code to [React](https://github.com/theia-ide/theia/issues/1915).
     */
    protected readonly supportedExtensions: Map<string, number> = new Map();

    readonly id = 'mini-browser-open-handler';
    readonly label = 'Mini Browser';

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(MiniBrowserService)
    protected readonly miniBrowserService: MiniBrowserService;

    async onStart(): Promise<void> {
        (await this.miniBrowserService.supportedFileExtensions()).forEach(entry => {
            const { extension, priority } = entry;
            this.supportedExtensions.set(extension, priority);
        });
    }

    canHandle(uri: URI): number {
        // It does not guard against directories. For instance, a folder with this name: `Hahahah.html`.
        // We could check with the FS, but then, this method would become async again.
        const extension = uri.toString().split('.').pop();
        if (extension) {
            return this.supportedExtensions.get(extension.toLocaleLowerCase()) || 0;
        }
        return 0;
    }

    async open(uri?: URI, options?: MiniBrowserOpenerOptions): Promise<MiniBrowser> {
        const mergedOptions = await this.options(uri, options);
        const widget = await this.widgetManager.getOrCreateWidget<MiniBrowser>(MiniBrowser.Factory.ID, mergedOptions);
        await this.doOpen(widget, mergedOptions);
        const { area } = mergedOptions.widgetOptions;
        if (area !== 'main') {
            this.shell.resize(this.shell.mainPanel.node.offsetWidth / 2, area);
        }
        return widget;
    }

    protected async options(uri?: URI, options?: MiniBrowserOpenerOptions): Promise<MiniBrowserOpenerOptions & { widgetOptions: ApplicationShell.WidgetOptions }> {
        // Get the default options.
        let result = await this.defaultOptions();
        if (uri) {
            // Decorate it with a few properties inferred from the URI.
            const startPage = uri.toString();
            const name = await this.labelProvider.getName(uri);
            const iconClass = `${await this.labelProvider.getIcon(uri)} file-icon`;
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
        return scheme === 'http' || scheme === 'https' || (scheme === 'file' && uri.toString().endsWith('.html'));
    }

    protected async defaultOptions(): Promise<MiniBrowserOpenerOptions & { widgetOptions: ApplicationShell.WidgetOptions }> {
        return {
            mode: 'activate',
            widgetOptions: { area: 'main' },
            sandbox: MiniBrowserProps.SandboxOptions.DEFAULT,
            toolbar: 'show'
        };
    }

}
