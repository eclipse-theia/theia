// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { animationFrame, UnsafeWidgetUtilities, WidgetManager } from '@theia/core/lib/browser';
import { MessageLoop } from '@lumino/messaging';
import { Widget as LuminoWidget } from '@lumino/widgets';
import { PreferencesWidget } from '@theia/preferences/lib/browser/views/preference-widget';
import { PreferencesSearchbarWidget } from '@theia/preferences/lib/browser/views/preference-searchbar-widget';

/** Opens the same Settings widget as the IDE, embedded in the Work Hub overlay. */
export class MobileWorkHubPreferencesSheet {

    readonly node: HTMLElement;
    protected readonly widgetHost: HTMLElement;
    protected visible = false;
    protected preferencesWidget: PreferencesWidget | undefined;
    protected widgetHostResizeObserver: ResizeObserver | undefined;

    protected readonly onKeyDown = (ev: KeyboardEvent): void => {
        if (ev.key === 'Escape' && this.visible) {
            ev.stopPropagation();
            this.hide();
        }
    };

    constructor(protected readonly widgetManager: WidgetManager) {
        this.node = document.createElement('div');
        this.node.className = 'theia-mobile-work-hub-preferences';
        this.node.setAttribute('role', 'dialog');
        this.node.setAttribute('aria-modal', 'true');
        this.node.setAttribute('aria-hidden', 'true');
        this.node.hidden = true;

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-work-hub-preferences-backdrop';
        backdrop.addEventListener('click', () => this.hide());

        const sheet = document.createElement('section');
        sheet.className = 'theia-mobile-work-hub-preferences-sheet';

        const header = document.createElement('header');
        header.className = 'theia-mobile-work-hub-preferences-header';

        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'theia-mobile-work-hub-preferences-back theia-mobile-projects-header-back';
        backBtn.title = nls.localize('qaap/mobileProjects/backToProjects', 'Back to projects');
        backBtn.setAttribute('aria-label', backBtn.title);
        backBtn.innerHTML = '<span class="codicon codicon-chevron-left" aria-hidden="true"></span>';
        backBtn.addEventListener('click', () => this.hide());

        const title = document.createElement('h2');
        title.className = 'theia-mobile-work-hub-preferences-title';
        title.textContent = nls.localize('theia/preferences/ai-features', 'AI Features');

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'theia-mobile-work-hub-preferences-close codicon codicon-close';
        closeBtn.title = nls.localize('qaap/mobileWorkHubPreferences/close', 'Close');
        closeBtn.setAttribute('aria-label', closeBtn.title);
        closeBtn.addEventListener('click', () => this.hide());

        header.append(backBtn, title, closeBtn);

        this.widgetHost = document.createElement('div');
        this.widgetHost.className = 'theia-mobile-work-hub-preferences-widget-host';

        sheet.append(header, this.widgetHost);
        this.node.append(backdrop, sheet);
    }

    isVisible(): boolean {
        return this.visible;
    }

    async show(query?: string): Promise<void> {
        const widget = await this.widgetManager.getOrCreateWidget<PreferencesWidget>(PreferencesWidget.ID);
        this.preferencesWidget = widget;
        if (!this.node.parentElement) {
            document.body.appendChild(this.node);
        }
        this.attachWidget(widget);
        this.node.hidden = false;
        this.node.classList.add('theia-mod-visible');
        this.node.setAttribute('aria-hidden', 'false');
        this.visible = true;
        document.addEventListener('keydown', this.onKeyDown, true);
        this.observeWidgetHostResize(widget);
        this.syncWidgetLayout(widget);
        if (typeof query === 'string') {
            await this.applyPreferencesQuery(widget, query);
        }
    }

    hide(): void {
        if (!this.visible) {
            return;
        }
        this.unobserveWidgetHostResize();
        this.detachWidget();
        this.node.classList.remove('theia-mod-visible');
        this.node.hidden = true;
        this.node.setAttribute('aria-hidden', 'true');
        this.visible = false;
        document.removeEventListener('keydown', this.onKeyDown, true);
    }

    dispose(): void {
        this.unobserveWidgetHostResize();
        this.hide();
        this.node.remove();
    }

    protected attachWidget(widget: PreferencesWidget): void {
        if (!this.widgetHost.isConnected) {
            return;
        }
        if (widget.isAttached && widget.node.parentElement !== this.widgetHost) {
            UnsafeWidgetUtilities.detach(widget);
        }
        if (!widget.isAttached) {
            UnsafeWidgetUtilities.attach(widget, this.widgetHost);
        } else if (widget.node.parentElement !== this.widgetHost) {
            this.widgetHost.appendChild(widget.node);
        }
        widget.node.classList.add('theia-mobile-work-hub-preferences-embed');
    }

    protected detachWidget(): void {
        const widget = this.preferencesWidget;
        if (!widget) {
            return;
        }
        widget.node.classList.remove('theia-mobile-work-hub-preferences-embed');
        if (widget.isAttached) {
            UnsafeWidgetUtilities.detach(widget);
        }
    }

    protected syncWidgetLayout(widget: PreferencesWidget): void {
        requestAnimationFrame(() => {
            if (!this.visible || !this.widgetHost.isConnected) {
                return;
            }
            const rect = this.widgetHost.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                MessageLoop.sendMessage(widget, new LuminoWidget.ResizeMessage(rect.width, rect.height));
            }
        });
    }

    protected observeWidgetHostResize(widget: PreferencesWidget): void {
        this.unobserveWidgetHostResize();
        if (typeof ResizeObserver === 'undefined') {
            return;
        }
        this.widgetHostResizeObserver = new ResizeObserver(() => {
            this.syncWidgetLayout(widget);
        });
        this.widgetHostResizeObserver.observe(this.widgetHost);
    }

    protected unobserveWidgetHostResize(): void {
        this.widgetHostResizeObserver?.disconnect();
        this.widgetHostResizeObserver = undefined;
    }

    /** Match `CommonCommands.OPEN_PREFERENCES` once the embedded widget has rendered. */
    protected async applyPreferencesQuery(widget: PreferencesWidget, query: string): Promise<void> {
        await animationFrame(2);
        if (!this.visible) {
            return;
        }
        const searchId = PreferencesSearchbarWidget.SEARCHBAR_ID;
        for (let attempt = 0; attempt < 8; attempt++) {
            const searchInput = widget.node.querySelector<HTMLInputElement>(`#${searchId}`);
            if (searchInput) {
                await widget.setSearchTerm(query);
                this.syncWidgetLayout(widget);
                return;
            }
            await animationFrame();
        }
        await widget.setSearchTerm(query);
    }
}
