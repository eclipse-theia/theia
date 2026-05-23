// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import {
    matchesMobileNarrowViewport,
    MOBILE_NARROW_VIEWPORT_MEDIA_QUERY,
    MOBILE_ONE_COLUMN_LAYOUT_CLASS
} from '@theia/core/lib/browser/shell/mobile-layout-state';
import { MessageLoop } from '@lumino/messaging';
import { Widget } from '@lumino/widgets';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { toArray } from '@lumino/algorithm';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { Keybinding, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    QAAP_WATERMARK_ENTRY_DEFS,
    QAAP_WATERMARK_PREFERRED_KEYBINDINGS,
    localizeWatermarkLabel,
    resolveWatermarkCommandId
} from './qaap-watermark-entries';

const EMPTY_BRAND_CLASS = 'qaap-empty-workbench-brand';
const WATERMARK_ENTRY_CLASS = 'qaap-watermark-entry';
const SHORTCUTS_CLASS = 'qaap-empty-workbench-brand-shortcuts';
const LOGO_CLASS = 'qaap-empty-workbench-brand-logo';
const MAIN_PANEL_ID = 'theia-main-content-panel';

/**
 * Empty workbench wallpaper when the main dock has no widgets. On mobile one-column layout the
 * main dock node has no height (Lumino split); the brand layer is hosted on {@link ApplicationShell.node}.
 */
@injectable()
export class QaapEmptyWorkbenchBrandingContribution implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(KeybindingRegistry)
    protected readonly keybindings: KeybindingRegistry;

    protected readonly toDispose = new DisposableCollection();

    protected refreshHandle: number | undefined;

    protected readonly onMainPanelChanged = (): void => this.scheduleRefresh();

    protected readonly onViewportLayoutChange = (): void => this.scheduleRefresh();

    protected mobileMq: MediaQueryList | undefined =
        typeof window !== 'undefined' ? window.matchMedia(MOBILE_NARROW_VIEWPORT_MEDIA_QUERY) : undefined;

    protected readonly onDocumentClick = (event: MouseEvent): void => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        const row = target.closest(`.${WATERMARK_ENTRY_CLASS}`);
        if (!(row instanceof HTMLElement) || !row.dataset.commandId) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        void this.runWatermarkCommand(row.dataset.commandId);
    };

    onStart(_app: FrontendApplication): void {
        document.addEventListener('click', this.onDocumentClick, true);
        this.toDispose.push(Disposable.create(() => document.removeEventListener('click', this.onDocumentClick, true)));
        this.shell.mainPanel.widgetAdded.connect(this.onMainPanelChanged);
        this.shell.mainPanel.widgetRemoved.connect(this.onMainPanelChanged);
        this.toDispose.push(Disposable.create(() => {
            this.shell.mainPanel.widgetAdded.disconnect(this.onMainPanelChanged);
            this.shell.mainPanel.widgetRemoved.disconnect(this.onMainPanelChanged);
        }));
        const layoutObserver = new MutationObserver(() => this.scheduleRefresh());
        layoutObserver.observe(this.shell.node, { attributes: true, attributeFilter: ['class'] });
        this.toDispose.push(Disposable.create(() => layoutObserver.disconnect()));
        const uiObserver = new MutationObserver(() => this.scheduleRefresh());
        uiObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
        this.toDispose.push(Disposable.create(() => uiObserver.disconnect()));
        window.addEventListener('resize', this.onViewportLayoutChange);
        this.toDispose.push(Disposable.create(() => window.removeEventListener('resize', this.onViewportLayoutChange)));
        window.visualViewport?.addEventListener('resize', this.onViewportLayoutChange);
        this.toDispose.push(Disposable.create(() =>
            window.visualViewport?.removeEventListener('resize', this.onViewportLayoutChange)));
        this.mobileMq?.addEventListener('change', this.onViewportLayoutChange);
        this.toDispose.push(Disposable.create(() =>
            this.mobileMq?.removeEventListener('change', this.onViewportLayoutChange)));
        this.scheduleRefresh();
        window.setTimeout(() => this.scheduleRefresh(), 500);
        window.setTimeout(() => this.scheduleRefresh(), 2500);
    }

    onDidInitializeLayout(_app: FrontendApplication): void {
        this.scheduleRefresh();
    }

    onStop(): void {
        if (this.refreshHandle !== undefined) {
            window.cancelAnimationFrame(this.refreshHandle);
        }
        document.querySelectorAll(`.${EMPTY_BRAND_CLASS}`).forEach(node => node.remove());
        this.toDispose.dispose();
    }

    protected isBrandingEnabled(): boolean {
        if (document.documentElement.classList.contains('theia-splash-branded')) {
            return true;
        }
        if (Boolean(FrontendApplicationConfigProvider.get().applicationIcon?.trim())) {
            return true;
        }
        const logo = getComputedStyle(document.documentElement).getPropertyValue('--theia-workbench-brand-logo-url').trim();
        return logo.length > 0 && logo !== 'none';
    }

    protected scheduleRefresh(): void {
        if (this.refreshHandle !== undefined) {
            window.cancelAnimationFrame(this.refreshHandle);
        }
        this.refreshHandle = window.requestAnimationFrame(() => {
            this.refreshHandle = undefined;
            this.refresh();
        });
    }

    protected refresh(): void {
        if (!this.isBrandingEnabled()) {
            return;
        }
        this.removeStaleBrandNodes();
        if (!this.shouldShowEmptyBrand()) {
            return;
        }
        const host = this.getBrandHost();
        let brand: HTMLElement | null = document.querySelector<HTMLElement>(`.${EMPTY_BRAND_CLASS}`);
        if (brand && brand.parentElement !== host) {
            brand.remove();
            brand = null;
        }
        if (!brand) {
            brand = host.querySelector<HTMLElement>(`:scope > .${EMPTY_BRAND_CLASS}`);
        }
        if (!brand) {
            brand = this.createEmptyBrandRoot();
            host.insertBefore(brand, host.firstChild);
        }
        this.renderShortcuts(brand);
        this.requestShellRelayout();
    }

    protected requestShellRelayout(): void {
        MessageLoop.postMessage(this.shell, Widget.Msg.FitRequest);
        MessageLoop.postMessage(this.shell.mainPanel, Widget.Msg.FitRequest);
    }

    protected shouldShowEmptyBrand(): boolean {
        if (!this.isMainAreaEmpty()) {
            return false;
        }
        const projects = document.querySelector('.theia-mobile-projects.theia-mod-visible');
        if (projects) {
            return false;
        }
        // Narrow viewport uses the projects dashboard as home; the desktop watermark only traps users
        // on the logo after a workspace reload when the sheet was dismissed and main is still empty.
        if (this.isMobileLayout() || matchesMobileNarrowViewport()) {
            return false;
        }
        // Desktop: sidebar may stay expanded; still show the empty-editor watermark in main.
        return true;
    }

    protected isMainAreaEmpty(): boolean {
        return toArray(this.shell.mainPanel.widgets()).length === 0;
    }

    protected isMobileLayout(): boolean {
        return this.shell.node.classList.contains(MOBILE_ONE_COLUMN_LAYOUT_CLASS);
    }

    protected getBrandHost(): HTMLElement {
        if (this.isMobileLayout()) {
            return this.shell.node;
        }
        return document.getElementById(MAIN_PANEL_ID) ?? this.shell.mainPanel.node;
    }

    protected removeStaleBrandNodes(): void {
        const host = this.getBrandHost();
        document.querySelectorAll(`.${EMPTY_BRAND_CLASS}`).forEach(node => {
            if (node.parentElement !== host) {
                node.remove();
            } else if (!this.shouldShowEmptyBrand()) {
                node.remove();
            }
        });
        document.querySelectorAll('.qaap-mobile-empty-brand').forEach(node => node.remove());
    }

    protected createEmptyBrandRoot(): HTMLElement {
        const root = document.createElement('div');
        root.className = EMPTY_BRAND_CLASS;
        root.setAttribute('role', 'presentation');

        const logo = document.createElement('div');
        logo.className = LOGO_CLASS;
        logo.setAttribute('role', 'img');
        logo.setAttribute('aria-label', 'Qaap');

        const shortcuts = document.createElement('nav');
        shortcuts.className = SHORTCUTS_CLASS;
        shortcuts.setAttribute('aria-label', 'Atajos del editor');

        root.append(logo, shortcuts);
        return root;
    }

    protected renderShortcuts(root: HTMLElement): void {
        const shortcuts = root.querySelector(`.${SHORTCUTS_CLASS}`);
        if (!(shortcuts instanceof HTMLElement)) {
            return;
        }
        const entries = this.getWatermarkEntries();
        const signature = entries.map(e => e.commandId).join('\0');
        if (shortcuts.dataset.qaapShortcutsSignature === signature) {
            return;
        }
        shortcuts.dataset.qaapShortcutsSignature = signature;
        shortcuts.replaceChildren(...entries.map(({ commandId, label }) => this.createShortcutRow(commandId, label)));
    }

    protected getWatermarkEntries(): { commandId: string; label: string }[] {
        const isRegistered = (id: string): boolean => this.commands.getCommand(id) !== undefined;
        const entries: { commandId: string; label: string }[] = [];
        for (const def of QAAP_WATERMARK_ENTRY_DEFS) {
            const commandId = def.commandCandidates
                ? resolveWatermarkCommandId(def.commandCandidates, isRegistered)
                : (isRegistered(def.commandId) ? def.commandId : undefined);
            if (commandId) {
                entries.push({ commandId, label: localizeWatermarkLabel(def) });
            }
        }
        return entries;
    }

    protected createShortcutRow(commandId: string, label: string): HTMLElement {
        const row = document.createElement('dl');
        row.className = WATERMARK_ENTRY_CLASS;
        row.dataset.commandId = commandId;
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', label);

        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        this.renderKeybinding(dd, commandId);

        row.append(dt, dd);
        return row;
    }

    protected async runWatermarkCommand(commandId: string): Promise<void> {
        if (this.commands.getCommand(commandId)) {
            await this.commands.executeCommand(commandId);
        }
    }

    protected renderKeybinding(container: HTMLElement, commandId: string): void {
        const binding = this.resolveDisplayKeybinding(commandId);
        if (!binding) {
            return;
        }
        const wrapper = document.createElement('span');
        wrapper.className = 'monaco-keybinding';
        wrapper.setAttribute('aria-hidden', 'true');
        for (const keyCode of this.keybindings.resolveKeybinding(binding)) {
            for (const part of this.keybindings.componentsForKeyCode(keyCode)) {
                const key = document.createElement('span');
                key.className = 'monaco-keybinding-key';
                key.textContent = part;
                wrapper.appendChild(key);
            }
        }
        container.appendChild(wrapper);
    }

    protected resolveDisplayKeybinding(commandId: string): Keybinding | undefined {
        const bindings = this.keybindings.getKeybindingsForCommand(commandId);
        const preferred = QAAP_WATERMARK_PREFERRED_KEYBINDINGS[commandId];
        if (preferred) {
            return bindings.find(candidate => candidate.keybinding === preferred) ?? bindings[0];
        }
        return bindings[0];
    }
}

/** @deprecated Use {@link QaapEmptyWorkbenchBrandingContribution}. */
export const MobileEmptyWorkbenchBrandingContribution = QaapEmptyWorkbenchBrandingContribution;
