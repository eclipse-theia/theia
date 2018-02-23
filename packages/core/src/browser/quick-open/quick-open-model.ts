/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from "../../common/uri";
import { Keybinding } from '../keybinding';

export interface Highlight {
    start: number
    end: number
}

export enum QuickOpenMode {
    PREVIEW,
    OPEN,
    OPEN_IN_BACKGROUND
}

export interface QuickOpenItemOptions {
    tooltip?: string;
    label?: string;
    labelHighlights?: Highlight[];
    description?: string;
    descriptionHighlights?: Highlight[];
    detail?: string;
    detailHighlights?: Highlight[];
    hidden?: boolean;
    uri?: URI;
    iconClass?: string;
    keybinding?: Keybinding;
    run?(mode: QuickOpenMode): boolean;
}

export class QuickOpenItem {

    private options: QuickOpenItemOptions;

    constructor(options?: QuickOpenItemOptions) {
        this.options = options || {};
    }

    getTooltip(): string | undefined {
        return this.options.tooltip || this.getLabel();
    }
    getLabel(): string | undefined {
        return this.options.label;
    }
    getLabelHighlights(): Highlight[] {
        return this.options.labelHighlights || [];
    }
    getDescription(): string | undefined {
        return this.options.description;
    }
    getDescriptionHighlights(): Highlight[] | undefined {
        return this.options.descriptionHighlights;
    }
    getDetail(): string | undefined {
        return this.options.detail;
    }
    getDetailHighlights(): Highlight[] | undefined {
        return this.options.detailHighlights;
    }
    isHidden(): boolean {
        return this.options.hidden || false;
    }
    getUri(): URI | undefined {
        return this.options.uri;
    }
    getIconClass(): string | undefined {
        return this.options.iconClass;
    }
    getKeybinding(): Keybinding | undefined {
        return this.options.keybinding;
    }
    run(mode: QuickOpenMode): boolean {
        if (!this.options.run) {
            return false;
        }
        return this.options.run(mode);
    }
}

export class QuickOpenGroupItem extends QuickOpenItem {
    getGroupLabel(): string | undefined {
        return undefined;
    }
    showBorder(): boolean {
        return false;
    }
}

export interface QuickOpenModel {
    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void;
}
