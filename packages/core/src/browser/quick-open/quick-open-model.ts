/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from "../../common/uri";
import { Keybinding } from '../../common/keybinding';

export interface QuickOpenAutoFocus {
    /**
     * The index of the element to focus in the result list.
     */
    autoFocusIndex?: number;

    /**
     * If set to true, will automatically select the first entry from the result list.
     */
    autoFocusFirstEntry?: boolean;

    /**
     * If set to true, will automatically select the second entry from the result list.
     */
    autoFocusSecondEntry?: boolean;

    /**
     * If set to true, will automatically select the last entry from the result list.
     */
    autoFocusLastEntry?: boolean;

    /**
     * If set to true, will automatically select any entry whose label starts with the search
     * value. Since some entries to the top might match the query but not on the prefix, this
     * allows to select the most accurate match (matching the prefix) while still showing other
     * elements.
     */
    autoFocusPrefixMatch?: string;
}

export interface Highlight {
    start: number
    end: number
}

export class QuickOpenItem {
    getTooltip(): string | undefined {
        return this.getLabel();
    }
    getLabel(): string | undefined {
        return undefined;
    }
    getLabelHighlights(): Highlight[] {
        return [];
    }
    getDescription(): string | undefined {
        return undefined;
    }
    getDescriptionHighlights(): Highlight[] | undefined {
        return undefined;
    }
    getDetail(): string | undefined {
        return undefined;
    }
    getDetailHighlights(): Highlight[] | undefined {
        return undefined;
    }
    isHidden(): boolean {
        return false;
    }
    getUri(): URI | undefined {
        return undefined;
    }
    getIconClass(): string | undefined {
        return undefined;
    }
    getKeybinding(): Keybinding | undefined {
        return undefined;
    }
    run(): boolean {
        return false;
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
    getItems(lookFor: string): QuickOpenItem[];
    getAutoFocus(lookFor: string): QuickOpenAutoFocus;
}