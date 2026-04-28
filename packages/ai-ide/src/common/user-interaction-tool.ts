// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

export const USER_INTERACTION_FUNCTION_ID = 'userInteraction';

export interface EmptyContentRef {
    empty: true;
    label?: string;
}

export interface PathContentRef {
    path: string;
    gitRef?: string;
    line?: number;
}

export type ContentRef = string | PathContentRef | EmptyContentRef;

export function isEmptyContentRef(ref: ContentRef): ref is EmptyContentRef {
    return typeof ref === 'object' && 'empty' in ref && ref.empty === true;
}

export interface UserInteractionLink {
    ref: ContentRef;
    rightRef?: ContentRef;
    label?: string;
    autoOpen?: boolean;
}

export function resolveContentRef(ref: ContentRef): PathContentRef | EmptyContentRef {
    if (typeof ref === 'string') {
        return { path: ref };
    }
    return ref;
}

export interface UserInteractionOption {
    text: string;
    value: string;
    description?: string;
    buttonLabel?: string;
}

export interface UserInteractionStep {
    title: string;
    message: string;
    options?: UserInteractionOption[];
    links?: UserInteractionLink[];
}

export interface UserInteractionStepResult {
    title: string;
    value?: string;
    comments?: string[];
    skipped?: boolean;
}

export interface UserInteractionResult {
    completed: boolean;
    steps: UserInteractionStepResult[];
}

export interface UserInteractionArgs {
    interactions: UserInteractionStep[];
}

export interface UserInteractionInput {
    title: string;
    stepCount: number;
}

export function parseUserInteractionInput(args: string | undefined): UserInteractionInput {
    if (!args) {
        return { title: '', stepCount: 0 };
    }
    try {
        const parsed = JSON.parse(args);
        const interactions = Array.isArray(parsed.interactions) ? parsed.interactions : [];
        const firstTitle = typeof interactions[0]?.title === 'string' ? interactions[0].title : '';
        return { title: firstTitle, stepCount: interactions.length };
    } catch {
        const match = /"title"\s*:\s*"([^"]*)"?/.exec(args);
        return { title: match?.[1] ?? '', stepCount: 0 };
    }
}

export function parseUserInteractionArgs(args: string | undefined): UserInteractionArgs | undefined {
    if (!args) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(args);
        if (!Array.isArray(parsed.interactions)) {
            return undefined;
        }
        const validSteps = parsed.interactions
            .map(parseStep)
            .filter((step: UserInteractionStep | undefined): step is UserInteractionStep => step !== undefined);
        if (validSteps.length === 0) {
            return undefined;
        }
        return { interactions: validSteps };
    } catch {
        return undefined;
    }
}

function parseStep(raw: unknown): UserInteractionStep | undefined {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const obj = raw as Record<string, unknown>;
    if (typeof obj.title !== 'string' || typeof obj.message !== 'string') {
        return undefined;
    }
    let options: UserInteractionOption[] | undefined;
    if (Array.isArray(obj.options)) {
        const validOptions = obj.options.filter(
            (opt: unknown) => !!opt && typeof opt === 'object'
                && typeof (opt as Record<string, unknown>).text === 'string'
                && typeof (opt as Record<string, unknown>).value === 'string'
        ) as UserInteractionOption[];
        options = validOptions.length > 0 ? validOptions : undefined;
    }
    let links: UserInteractionLink[] | undefined;
    if (Array.isArray(obj.links)) {
        const filtered = obj.links.filter(isValidLink) as UserInteractionLink[];
        links = filtered.length > 0 ? filtered : undefined;
    } else if (isValidLink(obj.link)) {
        links = [obj.link as UserInteractionLink];
    }
    return {
        title: obj.title,
        message: obj.message,
        options,
        links
    };
}

function isValidContentRef(ref: unknown): ref is ContentRef {
    if (typeof ref === 'string') {
        return ref.length > 0;
    }
    if (ref && typeof ref === 'object') {
        const obj = ref as Record<string, unknown>;
        if (obj.empty === true) {
            return true;
        }
        return typeof obj.path === 'string' && obj.path.length > 0;
    }
    return false;
}

function isValidLink(link: unknown): link is UserInteractionLink {
    if (!link || typeof link !== 'object') {
        return false;
    }
    const obj = link as Record<string, unknown>;
    if (!isValidContentRef(obj.ref)) {
        return false;
    }
    if (obj.rightRef !== undefined && !isValidContentRef(obj.rightRef)) {
        return false;
    }
    return true;
}
