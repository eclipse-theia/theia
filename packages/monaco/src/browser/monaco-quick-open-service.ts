/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { QuickOpenService, QuickOpenModel, QuickOpenOptions, QuickOpenItem, QuickOpenGroupItem } from "@theia/core/lib/browser";

export interface InternalMonacoQuickOpenOptions extends monaco.quickOpen.IQuickOpenControllerOpts {
    readonly prefix?: string;
    onClose?(canceled: boolean): void;
}

@injectable()
export class MonacoQuickOpenService extends QuickOpenService {

    protected _widget: monaco.quickOpen.QuickOpenWidget | undefined;
    protected options: InternalMonacoQuickOpenOptions | undefined;

    open(model: QuickOpenModel, options?: QuickOpenOptions): void {
        this.internalOpen(new MonacoQuickOpenOptions(model, options));
    }

    internalOpen(options: InternalMonacoQuickOpenOptions): void {
        this.options = options;
        this.widget.show(this.options.prefix || '');
    }

    protected get widget(): monaco.quickOpen.QuickOpenWidget {
        if (this._widget) {
            return this._widget;
        }
        const overlayWidgets = document.createElement('div');
        overlayWidgets.classList.add('quick-open-overlay');
        document.body.appendChild(overlayWidgets);

        const container = document.createElement('quick-open-container');
        container.style.position = 'absolute';
        container.style.top = '0px';
        container.style.right = '50%';
        overlayWidgets.appendChild(container);

        this._widget = new monaco.quickOpen.QuickOpenWidget(container, {
            onOk: () => this.onClose(false),
            onCancel: () => this.onClose(true),
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
        themeService.onThemeChange(() => {
            detach.dispose();
            this.attachQuickOpenStyler();
        });
    }

    protected onClose(cancelled: boolean): void {
        if (this.options && this.options.onClose) {
            this.options.onClose(cancelled);
        }
    }

    protected onType(lookFor: string): void {
        const options = this.options;
        if (this.widget && options) {
            this.widget.setInput(options.getModel(lookFor), options.getAutoFocus(lookFor), options.inputAriaLabel);
        }
    }

}

export class MonacoQuickOpenOptions implements InternalMonacoQuickOpenOptions {

    public readonly options: QuickOpenOptions.Resolved;

    constructor(
        public readonly model: QuickOpenModel,
        options?: QuickOpenOptions
    ) {
        this.model = model;
        this.options = QuickOpenOptions.resolveFuzzy(options);
    }

    get prefix(): string {
        return this.options.prefix;
    }

    get inputAriaLabel(): string {
        return this.options.inputTooltip;
    }

    onClose(cancelled: boolean): void {
        this.options.onClose(cancelled);
    }

    getModel(lookFor: string): monaco.quickOpen.QuickOpenModel {
        const entries: monaco.quickOpen.QuickOpenEntry[] = [];
        const items = this.model.getItems(lookFor);
        for (const item of items) {
            const entry = this.createEntry(item, lookFor);
            if (entry) {
                entries.push(entry);
            }
        }
        if (this.options.fuzzySort) {
            entries.sort((a, b) => monaco.quickOpen.QuickOpenEntry.compare(a, b, lookFor));
        }
        return new monaco.quickOpen.QuickOpenModel(entries);
    }

    protected createEntry(item: QuickOpenItem, lookFor: string): monaco.quickOpen.QuickOpenEntry | undefined {
        const labelHighlights = this.options.fuzzyMatchLabel ? this.matchesFuzzy(lookFor, item.getLabel()) : item.getLabelHighlights();
        if (!labelHighlights) {
            return undefined;
        }
        const descriptionHighlights = this.options.fuzzyMatchDescription ? this.matchesFuzzy(lookFor, item.getDescription()) : item.getDescriptionHighlights();
        const detailHighlights = this.options.fuzzyMatchDetail ? this.matchesFuzzy(lookFor, item.getDetail()) : item.getDetailHighlights();

        const entry = item instanceof QuickOpenGroupItem ? new QuickOpenEntryGroup(item) : new QuickOpenEntry(item);
        entry.setHighlights(labelHighlights, descriptionHighlights, detailHighlights);
        return entry;
    }

    protected matchesFuzzy(lookFor: string, value: string | undefined): monaco.quickOpen.IHighlight[] | undefined {
        if (!lookFor || !value) {
            return [];
        }
        return monaco.filters.matchesFuzzy(lookFor, value);
    }

    getAutoFocus(lookFor: string): monaco.quickOpen.IAutoFocus {
        return this.model.getAutoFocus(lookFor);
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
        return {
            getAriaLabel: () => keybinding.keyCode.label,
            getParts: () => [new monaco.keybindings.ResolvedKeybindingPart(
                keybinding.keyCode.ctrl,
                keybinding.keyCode.shift,
                keybinding.keyCode.alt,
                keybinding.keyCode.meta,
                keybinding.keyCode.key,
                keybinding.keyCode.key
            ), undefined]
        };
    }

    run(mode: monaco.quickOpen.Mode): boolean {
        if (mode === monaco.quickOpen.Mode.OPEN) {
            return this.item.run();
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
