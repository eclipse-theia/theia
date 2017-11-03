/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from "../../common/uri";
import { Keybinding } from '../../common/keybinding';

export interface Highlight {
    start: number
    end: number
}

export enum QuickOpenMode {
    PREVIEW,
    OPEN,
    OPEN_IN_BACKGROUND
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
    run(mode: QuickOpenMode): boolean {
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
    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void;
}
