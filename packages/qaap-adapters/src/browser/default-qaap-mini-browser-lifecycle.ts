// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { PanelLayout } from '@theia/core/lib/browser/widgets/widget';
import { MiniBrowser, MiniBrowserProps } from '@theia/mini-browser/lib/browser/mini-browser';
import { MiniBrowserOpenerOptions } from '@theia/mini-browser/lib/browser/mini-browser-opener-options';
import { normalizeMiniBrowserOpenUrl } from '@theia/mini-browser/lib/browser/mini-browser-url-utils';
import { QaapMiniBrowserLifecycle } from './qaap-mini-browser-lifecycle';

@injectable()
export class DefaultQaapMiniBrowserLifecycle implements QaapMiniBrowserLifecycle {

    afterOpen(widget: MiniBrowser, options?: MiniBrowserOpenerOptions): void {
        this.ensurePreviewChrome(widget, options);
        const startPage = typeof options?.startPage === 'string' ? normalizeMiniBrowserOpenUrl(options.startPage) : '';
        if (!startPage) {
            return;
        }
        const bump = (): void => {
            const layout = widget.layout as PanelLayout;
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

    protected ensurePreviewChrome(widget: MiniBrowser, options?: MiniBrowserOpenerOptions): void {
        const layout = widget.layout as PanelLayout;
        const child = layout.widgets[0];
        if (child && !child.isDisposed) {
            return;
        }
        const props: MiniBrowserProps = {
            toolbar: options?.toolbar,
            startPage: options?.startPage,
            sandbox: options?.sandbox,
            iconClass: options?.iconClass,
            name: options?.name,
            resetBackground: options?.resetBackground,
        };
        widget.setProps(props);
    }
}
