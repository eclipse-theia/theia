// *****************************************************************************
// Copyright (C) 2026 and others.
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

import { inject, injectable } from 'inversify';
import { Disposable, DisposableCollection } from '../common/disposable';
import { FrontendApplicationContribution } from './frontend-application-contribution';
import { SecondaryWindowService } from './window/secondary-window-service';

/**
 * Mirrors runtime-added `<style>` and `<link>` elements from the main window's `<head>`
 * into every secondary window, keeps CSSOM `insertRule`/`deleteRule` changes in sync,
 * and propagates body class mutations.
 *
 * Elements that are already managed by dedicated services are excluded:
 * - `monaco-colors` class stylesheets (managed by `MonacoFrontendApplicationContribution`)
 * - `contributedColorTheme` ID stylesheets (managed by `StylingService`)
 * - `theia-icon-theme` class stylesheets (managed by `PluginIconThemeService`)
 */
@injectable()
export class SecondaryWindowStyleMirror implements FrontendApplicationContribution {

    @inject(SecondaryWindowService)
    protected readonly secondaryWindowService: SecondaryWindowService;

    /** Maps a main-window element to its clones in each secondary window. */
    protected readonly cloneMap = new Map<HTMLStyleElement | HTMLLinkElement, Map<Window, HTMLStyleElement | HTMLLinkElement>>();

    /** The set of currently tracked secondary windows. */
    protected readonly trackedWindows = new Set<Window>();

    /** Records of CSSOM insertRule calls keyed by the main-window style element. */
    protected readonly cssomRules = new Map<HTMLStyleElement, Array<{ rule: string; index: number }>>();

    /** Original CSSStyleSheet methods, saved before monkey-patching. */
    protected originalInsertRule: typeof CSSStyleSheet.prototype.insertRule | undefined;
    protected originalDeleteRule: typeof CSSStyleSheet.prototype.deleteRule | undefined;

    /** Tracks which classes this mirror has added to each secondary window's body. */
    protected readonly mainOriginatedClasses = new Map<Window, Set<string>>();

    /** Disposable collection for cleanup on stop. */
    protected readonly toDispose = new DisposableCollection();

    /** Pending CSSOM rule re-syncs after insertRule (to capture rule.style mutations). */
    protected readonly pendingRuleSyncs = new Set<{ sheet: CSSStyleSheet; index: number }>();
    protected pendingRuleSyncScheduled = false;

    onStart(): void {
        this.observeHeadMutations();
        this.observeBodyClassMutations();
        this.patchCSSOM();

        this.toDispose.push(this.secondaryWindowService.onWindowLoaded(win => {
            this.trackedWindows.add(win);
            this.mainOriginatedClasses.set(win, new Set());
            this.snapshotExistingElements(win);
            this.syncBodyClasses(win);
        }));

        this.toDispose.push(this.secondaryWindowService.onWindowClosed(win => {
            this.trackedWindows.delete(win);
            this.mainOriginatedClasses.delete(win);
            for (const clones of this.cloneMap.values()) {
                clones.delete(win);
            }
        }));
    }

    onStop(): void {
        this.toDispose.dispose();
    }

    protected shouldExclude(element: HTMLStyleElement | HTMLLinkElement): boolean {
        return element.classList.contains('monaco-colors')
            || element.id === 'contributedColorTheme'
            || element.classList.contains('theia-icon-theme');
    }

    protected isStyleOrLink(node: Node): node is HTMLStyleElement | HTMLLinkElement {
        return node instanceof HTMLStyleElement || node instanceof HTMLLinkElement;
    }

    protected observeHeadMutations(): void {
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (let i = 0; i < mutation.addedNodes.length; i++) {
                    const node = mutation.addedNodes[i];
                    if (this.isStyleOrLink(node) && !this.shouldExclude(node)) {
                        this.trackAndCloneToAll(node);
                    }
                }
                for (let i = 0; i < mutation.removedNodes.length; i++) {
                    const node = mutation.removedNodes[i];
                    if (this.isStyleOrLink(node)) {
                        this.removeClones(node);
                    }
                }
            }
        });
        observer.observe(document.head, { childList: true });
        this.toDispose.push(Disposable.create(() => observer.disconnect()));
    }

    protected observeBodyClassMutations(): void {
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                const oldValue = mutation.oldValue || '';
                const newValue = document.body.getAttribute('class') || '';
                const oldClasses = new Set(oldValue.split(/\s+/).filter(c => c.length > 0));
                const newClasses = new Set(newValue.split(/\s+/).filter(c => c.length > 0));

                const added: string[] = [];
                const removed: string[] = [];

                for (const cls of newClasses) {
                    if (!oldClasses.has(cls)) {
                        added.push(cls);
                    }
                }
                for (const cls of oldClasses) {
                    if (!newClasses.has(cls)) {
                        removed.push(cls);
                    }
                }

                if (added.length === 0 && removed.length === 0) {
                    continue;
                }

                for (const win of this.trackedWindows) {
                    const tracked = this.mainOriginatedClasses.get(win);
                    if (!tracked) {
                        continue;
                    }
                    const secondaryBody = win.document.body;
                    if (!secondaryBody) {
                        continue;
                    }

                    for (const cls of added) {
                        secondaryBody.classList.add(cls);
                        tracked.add(cls);
                    }
                    for (const cls of removed) {
                        if (tracked.has(cls)) {
                            secondaryBody.classList.remove(cls);
                            tracked.delete(cls);
                        }
                    }
                }
            }
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
        this.toDispose.push(Disposable.create(() => observer.disconnect()));
    }

    protected patchCSSOM(): void {
        const self = this;
        const proto = CSSStyleSheet.prototype;
        this.originalInsertRule = proto.insertRule;
        this.originalDeleteRule = proto.deleteRule;

        proto.insertRule = function (this: CSSStyleSheet, rule: string, index?: number): number {
            const result = self.originalInsertRule!.call(this, rule, index);
            self.onInsertRule(this, rule, result);
            return result;
        };

        proto.deleteRule = function (this: CSSStyleSheet, index: number): void {
            self.originalDeleteRule!.call(this, index);
            self.onDeleteRule(this, index);
        };

        this.toDispose.push(Disposable.create(() => {
            if (this.originalInsertRule) {
                proto.insertRule = this.originalInsertRule;
            }
            if (this.originalDeleteRule) {
                proto.deleteRule = this.originalDeleteRule;
            }
        }));
    }

    protected onInsertRule(sheet: CSSStyleSheet, rule: string, index: number): void {
        const ownerElement = sheet.ownerNode;
        if (!(ownerElement instanceof HTMLStyleElement) || this.shouldExclude(ownerElement)) {
            return;
        }

        const clones = this.cloneMap.get(ownerElement);
        if (!clones) {
            return;
        }

        for (const [, clonedElement] of clones) {
            try {
                this.originalInsertRule!.call(clonedElement.sheet!, rule, index);
            } catch {
                // ignore — e.g. if the cloned sheet is in a closed window
            }
        }

        this.scheduleRuleResync(sheet, index);
    }

    protected scheduleRuleResync(sheet: CSSStyleSheet, index: number): void {
        this.pendingRuleSyncs.add({ sheet, index });
        if (!this.pendingRuleSyncScheduled) {
            this.pendingRuleSyncScheduled = true;
            queueMicrotask(() => this.flushRuleResyncs());
        }
    }

    protected flushRuleResyncs(): void {
        this.pendingRuleSyncScheduled = false;
        const entries = Array.from(this.pendingRuleSyncs);
        this.pendingRuleSyncs.clear();

        for (const { sheet, index } of entries) {
            const ownerElement = sheet.ownerNode;
            if (!(ownerElement instanceof HTMLStyleElement) || this.shouldExclude(ownerElement)) {
                continue;
            }

            const clones = this.cloneMap.get(ownerElement);
            if (!clones) {
                continue;
            }

            let sourceRule: CSSRule | undefined;
            try {
                sourceRule = sheet.cssRules[index];
            } catch {
                continue;
            }
            if (!sourceRule) {
                continue;
            }
            const sourceCssText = sourceRule.cssText;

            for (const [, clonedElement] of clones) {
                try {
                    const clonedSheet = clonedElement.sheet;
                    if (!clonedSheet) {
                        continue;
                    }
                    const clonedRule = clonedSheet.cssRules[index];
                    if (clonedRule && clonedRule.cssText !== sourceCssText) {
                        this.originalDeleteRule!.call(clonedSheet, index);
                        this.originalInsertRule!.call(clonedSheet, sourceCssText, index);
                    }
                } catch {
                    // ignore
                }
            }
        }
    }

    protected onDeleteRule(sheet: CSSStyleSheet, index: number): void {
        const ownerElement = sheet.ownerNode;
        if (!(ownerElement instanceof HTMLStyleElement) || this.shouldExclude(ownerElement)) {
            return;
        }

        const clones = this.cloneMap.get(ownerElement);
        if (!clones) {
            return;
        }

        for (const [, clonedElement] of clones) {
            try {
                this.originalDeleteRule!.call(clonedElement.sheet!, index);
            } catch {
                // ignore
            }
        }
    }

    protected snapshotExistingElements(win: Window): void {
        const elements = document.head.querySelectorAll('style, link[rel="stylesheet"]');
        for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as HTMLStyleElement | HTMLLinkElement;
            if (!this.shouldExclude(el)) {
                this.cloneIntoWindow(el, win);
            }
        }
    }

    protected trackAndCloneToAll(element: HTMLStyleElement | HTMLLinkElement): void {
        if (!this.cloneMap.has(element)) {
            this.cloneMap.set(element, new Map());
        }
        for (const win of this.trackedWindows) {
            this.cloneIntoWindow(element, win);
        }
    }

    protected cloneIntoWindow(element: HTMLStyleElement | HTMLLinkElement, win: Window): void {
        let clones = this.cloneMap.get(element);
        if (!clones) {
            clones = new Map();
            this.cloneMap.set(element, clones);
        }

        if (clones.has(win)) {
            return;
        }

        // Skip <link> elements whose href already exists in the target window's <head>
        if (element instanceof HTMLLinkElement) {
            const sourceHref = element.getAttribute('href');
            if (sourceHref && this.hasMatchingLink(win, sourceHref)) {
                return;
            }
        }

        const cloned = win.document.importNode(element, true) as HTMLStyleElement | HTMLLinkElement;
        win.document.head.appendChild(cloned);
        clones.set(win, cloned);

        // If the source element has CSSOM-only rules (added via insertRule, not present in textContent),
        // we need to replay them into the cloned sheet after it's attached.
        if (element instanceof HTMLStyleElement && element.sheet) {
            const replayCssomRules = (): void => {
                if (cloned instanceof HTMLStyleElement && cloned.sheet && element.sheet) {
                    const sourceRules = element.sheet.cssRules;
                    const clonedRules = cloned.sheet.cssRules;
                    // Only replay rules if there are more rules in the source than in the clone
                    // (the textContent-based rules are already present from the deep clone)
                    if (sourceRules.length > clonedRules.length) {
                        for (let i = clonedRules.length; i < sourceRules.length; i++) {
                            try {
                                // Use the original insertRule to avoid triggering the monkey-patch
                                this.originalInsertRule!.call(cloned.sheet, sourceRules[i].cssText, i);
                            } catch {
                                // ignore
                            }
                        }
                    }
                }
            };
            // Try immediately; if sheet isn't ready yet, defer
            if (cloned instanceof HTMLStyleElement && cloned.sheet) {
                replayCssomRules();
            } else {
                win.requestAnimationFrame(replayCssomRules);
            }
        }
    }

    protected hasMatchingLink(win: Window, href: string): boolean {
        const existingLinks = win.document.head.querySelectorAll('link[rel="stylesheet"]');
        for (let i = 0; i < existingLinks.length; i++) {
            const existing = existingLinks[i] as HTMLLinkElement;
            const existingHref = existing.getAttribute('href');
            if (existingHref === href) {
                return true;
            }
        }
        return false;
    }

    protected removeClones(element: HTMLStyleElement | HTMLLinkElement): void {
        const clones = this.cloneMap.get(element);
        if (clones) {
            for (const [, clonedElement] of clones) {
                clonedElement.remove();
            }
            this.cloneMap.delete(element);
        }
    }

    protected syncBodyClasses(win: Window): void {
        const mainClasses = document.body.classList;
        const secondaryBody = win.document.body;
        if (!secondaryBody) {
            return;
        }

        const tracked = this.mainOriginatedClasses.get(win);
        if (!tracked) {
            return;
        }

        // Add classes from main that are missing in secondary, and track them
        for (let i = 0; i < mainClasses.length; i++) {
            const cls = mainClasses[i];
            if (!secondaryBody.classList.contains(cls)) {
                secondaryBody.classList.add(cls);
            }
            tracked.add(cls);
        }
    }
}
