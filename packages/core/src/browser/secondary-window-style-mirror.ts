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

    onStart(): void {
        this.observeHeadMutations();
        this.observeBodyClassMutations();
        this.patchCSSOM();

        this.secondaryWindowService.onWindowLoaded(win => {
            this.trackedWindows.add(win);
            this.snapshotExistingElements(win);
            this.syncBodyClasses(win);
        });

        this.secondaryWindowService.onWindowClosed(win => {
            this.trackedWindows.delete(win);
            for (const clones of this.cloneMap.values()) {
                clones.delete(win);
            }
        });
    }

    protected shouldExclude(element: HTMLStyleElement | HTMLLinkElement): boolean {
        return element.classList.contains('monaco-colors') || element.id === 'contributedColorTheme';
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
    }

    protected observeBodyClassMutations(): void {
        const observer = new MutationObserver(() => {
            for (const win of this.trackedWindows) {
                this.syncBodyClasses(win);
            }
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
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
                clonedElement.sheet?.insertRule(rule, index);
            } catch {
                // ignore — e.g. if the cloned sheet is in a closed window
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
                clonedElement.sheet?.deleteRule(index);
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

        const cloned = win.document.importNode(element, true) as HTMLStyleElement | HTMLLinkElement;
        win.document.head.appendChild(cloned);
        clones.set(win, cloned);

        // If the source element has CSSOM-only rules (added via insertRule, not present in textContent),
        // we need to replay them into the cloned sheet after it's attached.
        if (element instanceof HTMLStyleElement && element.sheet) {
            // Use requestAnimationFrame to ensure the cloned element's sheet is available
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

        // Add classes from main that are missing in secondary
        for (let i = 0; i < mainClasses.length; i++) {
            if (!secondaryBody.classList.contains(mainClasses[i])) {
                secondaryBody.classList.add(mainClasses[i]);
            }
        }

        // Remove classes from secondary that are no longer on main
        const toRemove: string[] = [];
        for (let i = 0; i < secondaryBody.classList.length; i++) {
            if (!mainClasses.contains(secondaryBody.classList[i])) {
                toRemove.push(secondaryBody.classList[i]);
            }
        }
        for (const cls of toRemove) {
            secondaryBody.classList.remove(cls);
        }
    }
}
