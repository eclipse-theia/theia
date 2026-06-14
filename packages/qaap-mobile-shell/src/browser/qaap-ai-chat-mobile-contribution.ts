// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { FrontendApplication } from '@theia/core/lib/browser';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { ShellLayoutTransformer } from '@theia/core/lib/browser/shell/shell-layout-restorer';
import { OpenViewArguments } from '@theia/core/lib/browser/shell/view-contribution';
import { AIChatContribution } from '@theia/ai-chat-ui/lib/browser/ai-chat-ui-contribution';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import { QaapProjectBootstrapService } from './qaap-project-bootstrap-service';
import { isQaapNarrowMobileWorkbench, stripRightPanelWidgetsOnMobile } from './qaap-mobile-layout-utils';
import { QaapAiChatBootstrapChip } from './qaap-ai-chat-bootstrap-chip';

/** Body class for full-width AI chat on narrow viewports (see `qaap-ai-chat-mobile.css`). */
export const MOBILE_AI_CHAT_FULLWIDTH_BODY_CLASS = 'theia-mod-mobile-ai-chat-fullwidth';

/**
 * Mobile AI chat layout: full-width panel, layout restore, toggle behavior.
 * Replaces product patches formerly in `@theia/ai-chat-ui` `AIChatContribution`.
 */
@injectable()
export class QaapAiChatMobileContribution extends AIChatContribution implements ShellLayoutTransformer {

    @inject(QaapProjectBootstrapService)
    protected readonly bootstrap: QaapProjectBootstrapService;

    protected readonly mobileFullWidthLayoutDisposables = new DisposableCollection();
    protected readonly bootstrapChip = new QaapAiChatBootstrapChip();
    protected bootstrapChipHost: HTMLElement | undefined;

    override initialize(): void {
        super.initialize();
        this.mobileFullWidthLayoutDisposables.push(
            this.bootstrap.onStateChange(state => {
                this.bootstrapChip.update(state);
            })
        );
        this.mobileFullWidthLayoutDisposables.push(
            this.shell.onDidChangeCurrentWidget(() => this.scheduleMobileAiChatFullWidthUpdate())
        );
        const onRightTabChanged = (): void => this.scheduleMobileAiChatFullWidthUpdate();
        this.shell.rightPanelHandler.tabBar.currentChanged.connect(onRightTabChanged);
        this.mobileFullWidthLayoutDisposables.push(Disposable.create(() => {
            this.shell.rightPanelHandler.tabBar.currentChanged.disconnect(onRightTabChanged);
        }));
        window.addEventListener('resize', this.onWindowResizeForMobileChatLayout);
    }

    onStop(_app: FrontendApplication): void {
        window.removeEventListener('resize', this.onWindowResizeForMobileChatLayout);
        this.teardownBootstrapChip();
        this.mobileFullWidthLayoutDisposables.dispose();
        if (typeof document !== 'undefined') {
            document.body.classList.remove(MOBILE_AI_CHAT_FULLWIDTH_BODY_CLASS);
        }
    }

    protected readonly onWindowResizeForMobileChatLayout = (): void => {
        this.scheduleMobileAiChatFullWidthUpdate();
    };

    protected scheduleMobileAiChatFullWidthUpdate(): void {
        this.updateMobileAiChatFullWidthBodyClass();
        this.syncBootstrapChip();
        window.requestAnimationFrame(() => {
            this.updateMobileAiChatFullWidthBodyClass();
            this.syncBootstrapChip();
        });
    }

    protected syncBootstrapChip(): void {
        if (!isQaapNarrowMobileWorkbench()) {
            this.teardownBootstrapChip();
            return;
        }
        const widget = this.tryGetWidget();
        const inputHost = widget?.inputWidget?.node;
        if (!inputHost || !widget?.isAttached) {
            this.teardownBootstrapChip();
            return;
        }
        if (this.bootstrapChipHost !== inputHost) {
            this.teardownBootstrapChip();
            this.bootstrapChipHost = inputHost;
            this.bootstrapChip.mount(inputHost, () => void this.onBootstrapChipClick());
        }
        this.bootstrapChip.update(this.bootstrap.getStateSnapshot());
    }

    protected teardownBootstrapChip(): void {
        this.bootstrapChip.unmount();
        this.bootstrapChipHost = undefined;
    }

    protected async onBootstrapChipClick(): Promise<void> {
        const state = this.bootstrap.getStateSnapshot();
        if (state.previewUrl) {
            await this.bootstrap.focusPreview();
            return;
        }
        if (state.phase === 'running' || state.phase === 'ready-to-run' || state.lastPort !== undefined) {
            await this.bootstrap.openExistingPreview();
            return;
        }
        if (state.needsInstall || !state.descriptor?.nodeModulesPresent) {
            await this.bootstrap.runInstall();
            return;
        }
        await this.bootstrap.runDevServer();
    }

    protected updateMobileAiChatFullWidthBodyClass(): void {
        if (typeof document === 'undefined' || !document.body) {
            return;
        }
        if (!isQaapNarrowMobileWorkbench()) {
            document.body.classList.remove(MOBILE_AI_CHAT_FULLWIDTH_BODY_CLASS);
            return;
        }
        const widget = this.tryGetWidget();
        let fullWidth = false;
        if (widget?.isAttached && this.shell.isExpanded('right')) {
            const tabBar = this.shell.getTabBarFor(widget);
            fullWidth = tabBar?.currentTitle?.owner === widget;
        }
        document.body.classList.toggle(MOBILE_AI_CHAT_FULLWIDTH_BODY_CLASS, fullWidth);
    }

    override async openView(args: Partial<OpenViewArguments> = {}): Promise<ChatViewWidget> {
        const result = await super.openView(args);
        this.scheduleMobileAiChatFullWidthUpdate();
        return result;
    }

    override async closeView(): Promise<ChatViewWidget | undefined> {
        const result = await super.closeView();
        this.updateMobileAiChatFullWidthBodyClass();
        return result;
    }

    transformLayoutOnRestore(layoutData: ApplicationShell.LayoutData): void {
        stripRightPanelWidgetsOnMobile(layoutData, [ChatViewWidget.ID]);
    }

    override async initializeLayout(): Promise<void> {
        if (isQaapNarrowMobileWorkbench()) {
            return;
        }
        await super.initializeLayout();
    }

    override async toggleView(): Promise<ChatViewWidget> {
        if (!isQaapNarrowMobileWorkbench()) {
            const result = await super.toggleView();
            this.scheduleMobileAiChatFullWidthUpdate();
            return result;
        }
        const widget = this.tryGetWidget();
        let result: ChatViewWidget;
        if (!widget?.isAttached) {
            result = await this.openView({ activate: true });
        } else {
            const tabBar = this.shell.getTabBarFor(widget);
            const isChatCurrent = tabBar?.currentTitle?.owner === widget;
            if (this.shell.isExpanded('right') && isChatCurrent) {
                const closed = await this.closeView();
                result = closed ?? await this.openView({ activate: true });
            } else {
                result = await this.openView({ activate: true, reveal: true });
            }
        }
        this.scheduleMobileAiChatFullWidthUpdate();
        return result;
    }
}
