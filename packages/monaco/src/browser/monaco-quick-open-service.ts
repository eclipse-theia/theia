/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import {
    QuickOpenService, QuickOpenModel, QuickOpenOptions,
    QuickOpenItem, QuickOpenGroupItem, QuickOpenMode, KeySequence
} from "@theia/core/lib/browser";
import { KEY_CODE_MAP } from './monaco-keycode-map';
import { ILogger } from '@theia/core';

export interface MonacoQuickOpenControllerOpts extends monaco.quickOpen.IQuickOpenControllerOpts {
    readonly prefix?: string;
    onType?(lookFor: string, acceptor: (model: monaco.quickOpen.QuickOpenModel) => void): void;
    onClose?(canceled: boolean): void;
}

@injectable()
export class MonacoQuickOpenService extends QuickOpenService {

    protected readonly container: HTMLElement;
    protected _widget: monaco.quickOpen.QuickOpenWidget | undefined;
    protected opts: MonacoQuickOpenControllerOpts | undefined;
    protected previousActiveElement: Element | undefined;

    constructor(@inject(ILogger) protected readonly logger: ILogger) {
        super();
        const overlayWidgets = document.createElement('div');
        overlayWidgets.classList.add('quick-open-overlay');
        document.body.appendChild(overlayWidgets);

        const container = this.container = document.createElement('quick-open-container');
        container.style.position = 'absolute';
        container.style.top = '0px';
        container.style.right = '50%';
        overlayWidgets.appendChild(container);
    }

    open(model: QuickOpenModel, options?: QuickOpenOptions): void {
        this.internalOpen(new MonacoQuickOpenControllerOptsImpl(model, options));
    }

    internalOpen(opts: MonacoQuickOpenControllerOpts): void {
        this.opts = opts;
        this.previousActiveElement = window.document.activeElement;
        const widget = this.widget;
        widget.show(this.opts.prefix || '');
        widget.setPlaceHolder(opts.inputAriaLabel);
    }

    protected get widget(): monaco.quickOpen.QuickOpenWidget {
        if (this._widget) {
            return this._widget;
        }
        this._widget = new monaco.quickOpen.QuickOpenWidget(this.container, {
            onOk: () => {
                this.previousActiveElement = undefined;
                this.onClose(false);
            },
            onCancel: () => {
                if (this.previousActiveElement instanceof HTMLElement) {
                    this.previousActiveElement.focus();
                }
                this.previousActiveElement = undefined;
                this.onClose(true);
            },
            onType: lookFor => this.onType(lookFor || ''),
            onFocusLost: () => false
        }, {});
        this.attachQuickOpenStyler();
        this._widget.create();
        return this._widget;
    }

    protected attachQuickOpenStyler(): void {
        if (!this._widget) {
            return;
        }
        const themeService = monaco.services.StaticServices.standaloneThemeService.get();
        const detach = monaco.theme.attachQuickOpenStyler(this._widget, themeService);
        const dispose = themeService.onThemeChange(() => {
            detach.dispose();
            this.attachQuickOpenStyler();
            dispose.dispose();
        });
    }

    protected onClose(cancelled: boolean): void {
        if (this.opts && this.opts.onClose) {
            this.opts.onClose(cancelled);
        }
    }

    protected async onType(lookFor: string): Promise<void> {
        const opts = this.opts;
        if (this.widget && opts) {
            if (opts.onType) {
                opts.onType(lookFor, model =>
                    this.widget.setInput(model, opts.getAutoFocus(lookFor), opts.inputAriaLabel));
            } else {
                const m = opts.getModel(lookFor);
                this.widget.setInput(m, opts.getAutoFocus(lookFor), opts.inputAriaLabel);
            }
        }
    }

}

export class MonacoQuickOpenControllerOptsImpl implements MonacoQuickOpenControllerOpts {

    protected readonly options: QuickOpenOptions.Resolved;

    constructor(
        protected readonly model: QuickOpenModel,
        options?: QuickOpenOptions
    ) {
        this.model = model;
        this.options = QuickOpenOptions.resolve(options);
    }

    get prefix(): string {
        return this.options.prefix;
    }

    get inputAriaLabel(): string {
        return this.options.placeholder;
    }

    onClose(cancelled: boolean): void {
        this.options.onClose(cancelled);
    }

    private toOpenModel(lookFor: string, items: QuickOpenItem[]): monaco.quickOpen.QuickOpenModel {
        const entries: monaco.quickOpen.QuickOpenEntry[] = [];
        for (const item of items) {
            const entry = this.createEntry(item, lookFor);
            if (entry) {
                entries.push(entry);
            }
        }
        if (this.options.fuzzySort) {
            entries.sort((a, b) => monaco.quickOpen.compareEntries(a, b, lookFor));
        }
        return new monaco.quickOpen.QuickOpenModel(entries);
    }

    getModel(lookFor: string): monaco.quickOpen.QuickOpenModel {
        throw new Error("getModel not supported!");
    }

    onType(lookFor: string, acceptor: (model: monaco.quickOpen.QuickOpenModel) => void): void {
        this.model.onType(lookFor, items => {
            const result = this.toOpenModel(lookFor, items);
            acceptor(result);
        });
    }

    protected createEntry(item: QuickOpenItem, lookFor: string): monaco.quickOpen.QuickOpenEntry | undefined {
        const labelHighlights = this.options.fuzzyMatchLabel ? this.matchesFuzzy(lookFor, item.getLabel()) : item.getLabelHighlights();
        const descriptionHighlights = this.options.fuzzyMatchDescription ? this.matchesFuzzy(lookFor, item.getDescription()) : item.getDescriptionHighlights();
        const detailHighlights = this.options.fuzzyMatchDetail ? this.matchesFuzzy(lookFor, item.getDetail()) : item.getDetailHighlights();
        if ((lookFor && !labelHighlights && !descriptionHighlights && !detailHighlights)
            && !this.options.showItemsWithoutHighlight) {
            return undefined;
        }
        const entry = item instanceof QuickOpenGroupItem ? new QuickOpenEntryGroup(item) : new QuickOpenEntry(item);
        entry.setHighlights(labelHighlights || [], descriptionHighlights, detailHighlights);
        return entry;
    }

    protected matchesFuzzy(lookFor: string, value: string | undefined): monaco.quickOpen.IHighlight[] | undefined {
        if (!lookFor || !value) {
            return undefined;
        }
        return monaco.filters.matchesFuzzy(lookFor, value, true);
    }

    getAutoFocus(lookFor: string): monaco.quickOpen.IAutoFocus {
        if (this.options.selectIndex) {
            const idx = this.options.selectIndex(lookFor);
            if (idx >= 0) {
                return {
                    autoFocusIndex: idx
                };
            }
        }
        return {
            autoFocusFirstEntry: true,
            autoFocusPrefixMatch: lookFor
        };
    }

}

export class QuickOpenEntry extends monaco.quickOpen.QuickOpenEntry {

    constructor(
        public readonly item: QuickOpenItem
    ) {
        super();
    }

    getLabel(): string | undefined {
        return this.item.getLabel();
    }

    getAriaLabel(): string | undefined {
        return this.item.getTooltip();
    }

    getDetail(): string | undefined {
        return this.item.getDetail();
    }

    getDescription(): string | undefined {
        return this.item.getDescription();
    }

    isHidden(): boolean {
        return super.isHidden() || this.item.isHidden();
    }

    getResource(): monaco.Uri | undefined {
        const uri = this.item.getUri();
        return uri ? monaco.Uri.parse(uri.toString()) : undefined;
    }

    getIcon(): string | undefined {
        return this.item.getIconClass();
    }

    getKeybinding(): monaco.keybindings.ResolvedKeybinding | undefined {
        const keybinding = this.item.getKeybinding();
        if (!keybinding) {
            return undefined;
        }

        let keySequence: KeySequence;
        try {
            keySequence = KeySequence.parse(keybinding.keybinding);
        } catch (error) {
            return undefined;
        }

        if (keySequence.length < 2) {
            const keyCode = keySequence[0];
            if (keyCode.key !== undefined) { // This should not happen.
                const simple = new monaco.keybindings.SimpleKeybinding(
                    keyCode.ctrl,
                    keyCode.shift,
                    keyCode.alt,
                    keyCode.meta,
                    KEY_CODE_MAP[keyCode.key.keyCode]
                );
                return new monaco.keybindings.USLayoutResolvedKeybinding(simple, monaco.platform.OS);
            }
        } else if (keySequence.length === 2) {
            /* FIXME only 2 keycodes are supported by monaco.  */
            const first = keySequence[0];
            const second = keySequence[1];

            if (first.key !== undefined && second.key !== undefined) {
                const firstPart = new monaco.keybindings.SimpleKeybinding(
                    first.ctrl,
                    first.shift,
                    first.alt,
                    first.meta,
                    KEY_CODE_MAP[first.key.keyCode]
                );

                const secondPart = new monaco.keybindings.SimpleKeybinding(
                    second.ctrl,
                    second.shift,
                    second.alt,
                    second.meta,
                    KEY_CODE_MAP[second.key.keyCode]
                );

                return new monaco.keybindings.USLayoutResolvedKeybinding(
                    new monaco.keybindings.ChordKeybinding(firstPart, secondPart),
                    monaco.platform.OS);
            }
        } else {
            return undefined;
        }

    }

    run(mode: monaco.quickOpen.Mode): boolean {
        if (mode === monaco.quickOpen.Mode.OPEN) {
            return this.item.run(QuickOpenMode.OPEN);
        }
        if (mode === monaco.quickOpen.Mode.OPEN_IN_BACKGROUND) {
            return this.item.run(QuickOpenMode.OPEN_IN_BACKGROUND);
        }
        if (mode === monaco.quickOpen.Mode.PREVIEW) {
            return this.item.run(QuickOpenMode.PREVIEW);
        }
        return false;
    }

}

export class QuickOpenEntryGroup extends monaco.quickOpen.QuickOpenEntryGroup {

    constructor(
        public readonly item: QuickOpenGroupItem
    ) {
        super(new QuickOpenEntry(item));
    }

    getGroupLabel(): string {
        return this.item.getGroupLabel() || '';
    }

    showBorder(): boolean {
        return this.item.showBorder();
    }

}
