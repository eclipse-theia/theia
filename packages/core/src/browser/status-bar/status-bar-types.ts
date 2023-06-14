// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { MarkdownString } from '../../common/markdown-rendering/markdown-string';
import { AccessibilityInformation } from '../../common/accessibility';

export interface StatusBarEntry {
    /**
     * For icons we use Codicons by default, and Font Awesome icons will also be respected.
     * You can find Codicon classnames here: https://microsoft.github.io/vscode-codicons/dist/codicon.html
     * You can find Font Awesome classnames here: http://fontawesome.io/icons/
     *
     *
     * Codicon: $(<codiconClassName>) or $(codicon-<codiconClassName>)
     *
     * Font Awesome: $(fa-<fontAwesomeClassName>)
     *
     * To use animated icons use the following pattern:
     * $(iconClassName~typeOfAnimation)
     * Type of animation can be either spin or pulse.
     * Look here for more information to animated icons:
     * http://fontawesome.io/examples/#animated
     */
    text: string;
    alignment: StatusBarAlignment;
    name?: string;
    color?: string;
    backgroundColor?: string;
    className?: string;
    tooltip?: string | MarkdownString | HTMLElement;
    command?: string;
    arguments?: unknown[];
    priority?: number;
    accessibilityInformation?: AccessibilityInformation;
    affinity?: StatusBarAffinity;
    onclick?: (e: MouseEvent) => void;
}

export enum StatusBarAlignment {
    LEFT, RIGHT
}

export const STATUSBAR_WIDGET_FACTORY_ID = 'statusBar';

export const StatusBar = Symbol('StatusBar');

export interface StatusBar {
    setBackgroundColor(color?: string): Promise<void>;
    setColor(color?: string): Promise<void>;
    setElement(id: string, entry: StatusBarEntry): Promise<void>;
    removeElement(id: string): Promise<void>;
}

export interface StatusBarAffinity {
    /**
     * a reference to the {@link StatusBarEntry.id id} of another entry relative to which this item should be positioned.
     */
    id: string;

    /**
     * Where to position this entry relative to the entry referred to in the `id` field.
     */
    alignment: StatusBarAlignment;

    /**
     * Whether to treat this entry and the reference entry as a single entity for positioning and hover highlights
     */
    compact?: boolean;
}

export interface StatusBarViewModelEntry {
    id: string;
    leftChildren: StatusBarViewModelEntry[];
    head: StatusBarEntry;
    rightChildren: StatusBarViewModelEntry[];
}

export interface StatusBarViewEntry {
    id: string,
    entry: StatusBarEntry;
    compact?: boolean;
    /** Only present if compact = true */
    alignment?: StatusBarAlignment;
}
