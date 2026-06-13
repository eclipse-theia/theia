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
            await this.waitForAiConfigurationReady(widget);
            this.aiConfigurationSelectionService.selectConfigurationTab(tabId);
            await this.waitForAiConfigurationContent(widget);
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
        widget.node.style.flex = '1 1 auto';
        widget.node.style.minHeight = '0';
        widget.node.style.height = '100%';
        widget.node.style.width = '100%';
        if (widget.isHidden) {
            widget.show();
        }
        widget.update();
    }

    protected detachWidget(): void {
        const widget = this.configurationWidget;
        if (!widget) {
            return;
        }
        this.clearMobileAiConfigurationLayout(widget);
        widget.node.classList.remove('theia-mobile-work-hub-ai-config-embed');
        widget.node.style.removeProperty('flex');
        widget.node.style.removeProperty('min-height');
        widget.node.style.removeProperty('height');
        widget.node.style.removeProperty('width');
        if (widget.isAttached) {
            UnsafeWidgetUtilities.detach(widget);
        }
    }

    protected scheduleLayoutSync(widget: Widget, attempt = 0): void {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.syncWidgetLayout(widget, attempt);
            });
        });
    }

    protected syncWidgetLayout(widget: Widget, attempt = 0): void {
        if (!this.visible || !this.widgetHost.isConnected) {
            return;
        }
        const rect = this.widgetHost.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            if (attempt < 16) {
                this.scheduleLayoutSync(widget, attempt + 1);
            }
            return;
        }
        MessageLoop.sendMessage(widget, new LuminoWidget.ResizeMessage(rect.width, rect.height));
        if (widget instanceof AIConfigurationContainerWidget) {
            this.applyMobileAiConfigurationLayout(widget.node, rect);
        }
    }

    protected applyMobileAiConfigurationLayout(root: HTMLElement, hostRect: DOMRectReadOnly): void {
        const dock = root.querySelector<HTMLElement>('.ai-configuration-widget');
        if (dock) {
            const dockTop = dock.getBoundingClientRect().top - hostRect.top;
            const dockHeight = Math.max(240, Math.floor(hostRect.height - dockTop));
            dock.style.height = `${dockHeight}px`;
            dock.style.minHeight = `${dockHeight}px`;
            dock.style.maxHeight = `${dockHeight}px`;
            dock.style.boxSizing = 'border-box';
        }
        this.applyMobileAiConfigurationDetailHeight(root, hostRect);
    }

    protected clearMobileAiConfigurationLayout(widget: AIConfigurationContainerWidget): void {
        const dock = widget.node.querySelector<HTMLElement>('.ai-configuration-widget');
        dock?.style.removeProperty('height');
        dock?.style.removeProperty('min-height');
        dock?.style.removeProperty('max-height');
        dock?.style.removeProperty('box-sizing');
        this.clearMobileAiConfigurationDetailHeight(widget);
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

    protected unobserveWidgetHostResize(): void {
        this.widgetHostResizeObserver?.disconnect();
        this.widgetHostResizeObserver = undefined;
    }

    protected async waitForAiConfigurationReady(widget: AIConfigurationContainerWidget): Promise<void> {
        for (let attempt = 0; attempt < 40; attempt++) {
            if (!this.visible) {
                return;
            }
            const hasTabs = widget.node.querySelector('.ai-configuration-widget .lm-TabBar-tab') !== null;
            const hasActivePanel = widget.node.querySelector('.ai-configuration-widget .lm-DockPanel-widget') !== null;
            if (hasTabs && hasActivePanel) {
                return;
            }
            await animationFrame();
        }
    }

    protected async waitForAiConfigurationContent(widget: AIConfigurationContainerWidget): Promise<boolean> {
        for (let attempt = 0; attempt < 30; attempt++) {
            if (!this.visible) {
                return false;
            }
            const root = widget.node;
            const hasListItems = (root.querySelectorAll('.ai-configuration-list-item-label').length > 0);
            const hasDetailContent = !!root.querySelector(
                '.ai-configuration-detail .ai-configuration-widget-content, '
                + '.ai-configuration-detail .ai-configuration-table, '
                + '.ai-configuration-detail .ai-configuration-empty-state, '
                + '.ai-configuration-detail .settings-section',
            );
            const hasTabBar = root.querySelector('.ai-configuration-widget .lm-TabBar-tab') !== null;
            if (hasTabBar && (hasListItems || hasDetailContent)) {
                return true;
            }
            await animationFrame();
        }
        return false;
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
}
