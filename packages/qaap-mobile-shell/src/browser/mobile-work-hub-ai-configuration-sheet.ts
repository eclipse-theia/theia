// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { AIConfigurationSelectionService } from '@theia/ai-ide/lib/browser/ai-configuration/ai-configuration-service';
import { AIConfigurationContainerWidget } from '@theia/ai-ide/lib/browser/ai-configuration/ai-configuration-widget';
import { animationFrame, UnsafeWidgetUtilities, Widget, WidgetManager } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { MessageLoop } from '@lumino/messaging';
import { Widget as LuminoWidget } from '@lumino/widgets';
import { QAAP_WORK_HUB_AI_CONFIGURATION_AGENTS_TAB } from '../common/mobile-work-hub-catalog';

/** Opens the AI Configuration view embedded in the Work Hub overlay. */
export class MobileWorkHubAiConfigurationSheet {

    readonly node: HTMLElement;
    protected readonly widgetHost: HTMLElement;
    protected visible = false;
    protected configurationWidget: AIConfigurationContainerWidget | undefined;
    protected widgetHostResizeObserver: ResizeObserver | undefined;
    protected windowResizeListener: (() => void) | undefined;

    protected readonly onKeyDown = (ev: KeyboardEvent): void => {
        if (ev.key === 'Escape' && this.visible) {
            ev.stopPropagation();
            this.hide();
        }
    };

    constructor(
        protected readonly widgetManager: WidgetManager,
        protected readonly aiConfigurationSelectionService: AIConfigurationSelectionService,
    ) {
        this.node = document.createElement('div');
        this.node.className = 'theia-mobile-work-hub-preferences theia-mobile-work-hub-ai-configuration';
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
        title.textContent = nls.localize('theia/ai/core/aiConfiguration/label', 'AI Configuration');

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

    async show(tabId: string = QAAP_WORK_HUB_AI_CONFIGURATION_AGENTS_TAB): Promise<void> {
        const widget = await this.widgetManager.getOrCreateWidget<AIConfigurationContainerWidget>(
            AIConfigurationContainerWidget.ID,
        );
        this.configurationWidget = widget;
        if (!this.node.parentElement) {
            document.body.appendChild(this.node);
        }
        this.attachWidget(widget);
        this.node.hidden = false;
        this.node.classList.add('theia-mod-visible');
        this.node.setAttribute('aria-hidden', 'false');
        this.visible = true;
        document.addEventListener('keydown', this.onKeyDown, true);
        this.windowResizeListener = () => { this.scheduleLayoutSync(widget); };
        window.addEventListener('resize', this.windowResizeListener, { passive: true });
        this.observeWidgetHostResize(widget);
        this.scheduleLayoutSync(widget);
        await animationFrame(2);
        if (this.visible) {
            this.aiConfigurationSelectionService.selectConfigurationTab(tabId);
            await animationFrame(2);
            this.scheduleLayoutSync(widget);
        }
    }

    hide(): void {
        if (!this.visible) {
            return;
        }
        if (this.windowResizeListener) {
            window.removeEventListener('resize', this.windowResizeListener);
            this.windowResizeListener = undefined;
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

    protected attachWidget(widget: AIConfigurationContainerWidget): void {
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
        widget.node.classList.add('theia-mobile-work-hub-ai-config-embed');
    }

    protected detachWidget(): void {
        const widget = this.configurationWidget;
        if (!widget) {
            return;
        }
        this.clearMobileAiConfigurationDetailHeight(widget);
        widget.node.classList.remove('theia-mobile-work-hub-ai-config-embed');
        if (widget.isAttached) {
            UnsafeWidgetUtilities.detach(widget);
        }
    }

    protected syncWidgetLayout(widget: Widget): void {
        if (!this.visible || !this.widgetHost.isConnected) {
            return;
        }
        const rect = this.widgetHost.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return;
        }
        MessageLoop.sendMessage(widget, new LuminoWidget.ResizeMessage(rect.width, rect.height));
        this.applyMobileAiConfigurationDetailHeight(widget.node, rect);
    }

    protected applyMobileAiConfigurationDetailHeight(root: HTMLElement, hostRect: DOMRectReadOnly): void {
        const detail = root.querySelector<HTMLElement>('.ai-configuration-detail');
        if (!detail) {
            return;
        }
        const detailTop = detail.getBoundingClientRect().top - hostRect.top;
        const detailHeight = Math.max(200, Math.floor(hostRect.height - detailTop));
        detail.style.height = `${detailHeight}px`;
        detail.style.minHeight = `${detailHeight}px`;
        detail.style.maxHeight = `${detailHeight}px`;
        detail.style.boxSizing = 'border-box';
    }

    protected clearMobileAiConfigurationDetailHeight(widget: AIConfigurationContainerWidget): void {
        for (const detail of widget.node.querySelectorAll<HTMLElement>('.ai-configuration-detail')) {
            detail.style.removeProperty('height');
            detail.style.removeProperty('min-height');
            detail.style.removeProperty('max-height');
            detail.style.removeProperty('box-sizing');
        }
    }

    protected scheduleLayoutSync(widget: Widget): void {
        requestAnimationFrame(() => {
            this.syncWidgetLayout(widget);
            requestAnimationFrame(() => this.syncWidgetLayout(widget));
        });
    }

    protected observeWidgetHostResize(widget: Widget): void {
        this.unobserveWidgetHostResize();
        if (typeof ResizeObserver === 'undefined') {
            return;
        }
        this.widgetHostResizeObserver = new ResizeObserver(() => {
            this.scheduleLayoutSync(widget);
        });
        this.widgetHostResizeObserver.observe(this.widgetHost);
    }

    protected unobserveWidgetHostResize(): void {
        this.widgetHostResizeObserver?.disconnect();
        this.widgetHostResizeObserver = undefined;
    }
}
