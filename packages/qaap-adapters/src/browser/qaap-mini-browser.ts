// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message, MessageLoop } from '@theia/core/shared/@lumino/messaging';
import { BoxPanel, Widget } from '@theia/core/shared/@lumino/widgets';
import { PanelLayout } from '@theia/core/lib/browser/widgets/widget';
import { MiniBrowser, MiniBrowserProps } from '@theia/mini-browser/lib/browser/mini-browser';

/**
 * Qaap mini-browser shell: keep toolbar + iframe mounted and stretched inside the
 * mobile IDE main dock (layout restore and reopen used to leave an empty tab).
 */
@injectable()
export class QaapMiniBrowser extends MiniBrowser {

    @postConstruct()
    protected override init(): void {
        super.init();
        this.addClass('qaap-mini-browser-shell');
    }

    override setProps(raw: MiniBrowserProps): void {
        const props: MiniBrowserProps = {
            toolbar: raw.toolbar,
            startPage: raw.startPage,
            sandbox: raw.sandbox,
            iconClass: raw.iconClass,
            name: raw.name,
            resetBackground: raw.resetBackground,
        };
        if (JSON.stringify(props) === JSON.stringify(this.props) && this.hasLivePreviewContent()) {
            this.scheduleChromeRelayout();
            return;
        }
        this.replacePreviewContent(props);
    }

    override restoreState(oldState: object): void {
        if (!('props' in oldState) || this.hasLivePreviewContent()) {
            return;
        }
        this.setProps((oldState as { props: MiniBrowserProps }).props);
    }

    protected replacePreviewContent(props: MiniBrowserProps): void {
        this.toDisposeOnProps.dispose();
        this.toDispose.push(this.toDisposeOnProps);
        this.clearLayoutWidgets();
        this.props = props;
        this.title.caption = this.title.label = props.name || 'Browser';
        this.title.iconClass = props.iconClass || MiniBrowser.ICON;
        const content = this.createContent(props);
        const layout = this.layout as PanelLayout;
        layout.addWidget(content);
        BoxPanel.setStretch(content, 1);
        this.toDisposeOnProps.push(content);
        this.scheduleChromeRelayout();
    }

    protected clearLayoutWidgets(): void {
        const layout = this.layout as PanelLayout;
        for (const widget of [...layout.widgets]) {
            widget.dispose();
        }
    }

    protected hasLivePreviewContent(): boolean {
        const layout = this.layout as PanelLayout;
        const child = layout.widgets[0];
        return !!child && !child.isDisposed;
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.scheduleChromeRelayout();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const widget = (this.layout as PanelLayout).widgets[0];
        if (widget) {
            widget.activate();
        }
        this.scheduleChromeRelayout();
    }

    protected override onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        this.scheduleChromeRelayout();
    }

    scheduleChromeRelayout(): void {
        if (typeof window === 'undefined') {
            return;
        }
        window.requestAnimationFrame(() => {
            if (this.isDisposed || !this.isAttached) {
                return;
            }
            MessageLoop.sendMessage(this, Widget.ResizeMessage.UnknownSize);
            MessageLoop.postMessage(this, Widget.Msg.FitRequest);
            MessageLoop.postMessage(this, Widget.Msg.UpdateRequest);
            const layout = this.layout as PanelLayout;
            for (const child of layout.widgets) {
                if (child.isDisposed) {
                    continue;
                }
                MessageLoop.sendMessage(child, Widget.ResizeMessage.UnknownSize);
                MessageLoop.postMessage(child, Widget.Msg.FitRequest);
                MessageLoop.postMessage(child, Widget.Msg.UpdateRequest);
            }
        });
    }
}
