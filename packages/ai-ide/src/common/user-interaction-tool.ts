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

import { nls } from '@theia/core/lib/common/nls';

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

const SHA_PREFIX_LENGTH = 7;

function workingCopyLabel(): string {
    return nls.localize('theia/ai-ide/userInteractionWorkingCopy', 'Working Copy');
}

function emptyLabel(): string {
    return nls.localize('theia/ai-ide/userInteractionEmpty', 'Empty');
}

function gitRefTag(ref: PathContentRef): string {
    return ref.gitRef ? ref.gitRef.substring(0, SHA_PREFIX_LENGTH) : workingCopyLabel();
}

export function buildDiffLabel(
    left: PathContentRef | EmptyContentRef,
    right: PathContentRef | EmptyContentRef
): string {
    const leftIsEmpty = isEmptyContentRef(left);
    const rightIsEmpty = isEmptyContentRef(right);
    if (leftIsEmpty && rightIsEmpty) {
        return `${left.label || emptyLabel()} ⟷ ${right.label || emptyLabel()}`;
    }
    if (leftIsEmpty) {
        return `${(right as PathContentRef).path} (${left.label || emptyLabel()} ⟷ ${gitRefTag(right as PathContentRef)})`;
    }
    if (rightIsEmpty) {
        return `${(left as PathContentRef).path} (${gitRefTag(left as PathContentRef)} ⟷ ${right.label || emptyLabel()})`;
    }
    const leftPath = left as PathContentRef;
    const rightPath = right as PathContentRef;
    if (leftPath.path === rightPath.path) {
        return `${leftPath.path} (${gitRefTag(leftPath)} ⟷ ${gitRefTag(rightPath)})`;
    }
    return `${leftPath.path} ⟷ ${rightPath.path}`;
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

export function parseUserInteractionResult(raw: unknown): UserInteractionResult | undefined {
    let candidate: unknown = raw;
    if (typeof raw === 'string') {
        try {
            candidate = JSON.parse(raw);
        } catch {
            return undefined;
        }
    }
    if (!candidate || typeof candidate !== 'object') {
        return undefined;
    }
    const obj = candidate as Record<string, unknown>;
    if (typeof obj.completed !== 'boolean' || !Array.isArray(obj.steps)) {
        return undefined;
    }
    return obj as unknown as UserInteractionResult;
}

/**
 * Outcome of validating the raw `userInteraction` tool arguments.
 *
 * Validation is strict for anything that determines whether — and how — the user is asked
 * (`interactions`, each step, and each option), because silently discarding those turns a
 * decision step into an auto-completed informational one and skips the confirmation gate.
 * It stays lenient for `links`, which are decoration: an unresolvable link should not
 * discard the surrounding findings.
 */
export type UserInteractionValidation =
    | { ok: true, args: UserInteractionArgs }
    | { ok: false, error: string };

type StepValidation =
    | { ok: true, step: UserInteractionStep }
    | { ok: false, error: string };

type OptionsValidation =
    | { ok: true, options?: UserInteractionOption[] }
    | { ok: false, error: string };

const JSON_ENCODING_HINT = 'Do not JSON-encode nested values - pass real arrays and objects.';

function describeType(value: unknown): string {
    // eslint-disable-next-line no-null/no-null
    if (value === null) {
        return 'null';
    }
    if (Array.isArray(value)) {
        return 'array';
    }
    return typeof value;
}

/**
 * Describe the received type, adding the JSON-encoding hint when a string was received where
 * a structured value was expected - by far the most common way agents get these arguments wrong.
 */
function describeReceived(value: unknown): string {
    const type = describeType(value);
    return type === 'string' ? `${type}. ${JSON_ENCODING_HINT}` : `${type}.`;
}

export function parseUserInteractionArgs(args: string | undefined): UserInteractionValidation {
    if (!args) {
        return { ok: false, error: 'No arguments were provided.' };
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(args);
    } catch {
        return { ok: false, error: 'Arguments are not valid JSON.' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: `Arguments must be an object with an "interactions" array, received ${describeReceived(parsed)}` };
    }
    const interactions = (parsed as Record<string, unknown>).interactions;
    if (!Array.isArray(interactions)) {
        return { ok: false, error: `"interactions" must be an array of step objects, received ${describeReceived(interactions)}` };
    }
    if (interactions.length === 0) {
        return { ok: false, error: '"interactions" must contain at least one step.' };
    }
    const steps: UserInteractionStep[] = [];
    for (let index = 0; index < interactions.length; index++) {
        const step = parseStep(interactions[index], index + 1);
        if (!step.ok) {
            return step;
        }
        steps.push(step.step);
    }
    return { ok: true, args: { interactions: steps } };
}

function parseStep(raw: unknown, position: number): StepValidation {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, error: `Step ${position}: expected a step object, received ${describeReceived(raw)}` };
    }
    const obj = raw as Record<string, unknown>;
    if (typeof obj.title !== 'string' || typeof obj.message !== 'string') {
        return { ok: false, error: `Step ${position}: "title" and "message" are required strings.` };
    }
    const options = parseOptions(obj.options, position);
    if (!options.ok) {
        return options;
    }
    let links: UserInteractionLink[] | undefined;
    if (Array.isArray(obj.links)) {
        const filtered = obj.links
            .map(normalizeUserInteractionLink)
            .filter((link: UserInteractionLink | undefined): link is UserInteractionLink => link !== undefined);
        links = filtered.length > 0 ? filtered : undefined;
    } else {
        const link = normalizeUserInteractionLink(obj.link);
        if (link) {
            links = [link];
        }
    }
    return {
        ok: true,
        step: {
            title: obj.title,
            message: obj.message,
            options: options.options,
            links
        }
    };
}

/**
 * Validate a step's `options`. An absent or explicitly empty list means the step is
 * informational; anything else must be a fully well-formed array, since a partially
 * dropped option would silently offer the user a different choice than the agent intended.
 */
function parseOptions(raw: unknown, stepPosition: number): OptionsValidation {
    // eslint-disable-next-line no-null/no-null
    if (raw === undefined || raw === null) {
        return { ok: true, options: undefined };
    }
    if (!Array.isArray(raw)) {
        return {
            ok: false,
            error: `Step ${stepPosition}: "options" must be an array of {text, value} objects, received ${describeReceived(raw)}`
        };
    }
    const options: UserInteractionOption[] = [];
    for (let index = 0; index < raw.length; index++) {
        const candidate = raw[index];
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            return { ok: false, error: `Step ${stepPosition}, option ${index + 1}: "text" and "value" are required strings.` };
        }
        const obj = candidate as Record<string, unknown>;
        if (typeof obj.text !== 'string' || typeof obj.value !== 'string') {
            return { ok: false, error: `Step ${stepPosition}, option ${index + 1}: "text" and "value" are required strings.` };
        }
        const option: UserInteractionOption = { text: obj.text, value: obj.value };
        if (typeof obj.description === 'string') {
            option.description = obj.description;
        }
        if (typeof obj.buttonLabel === 'string') {
            option.buttonLabel = obj.buttonLabel;
        }
        options.push(option);
    }
    return { ok: true, options: options.length > 0 ? options : undefined };
}

function normalizeContentRef(ref: unknown): ContentRef | undefined {
    if (typeof ref === 'string') {
        return ref.length > 0 ? ref : undefined;
    }
    if (ref && typeof ref === 'object') {
        const obj = ref as Record<string, unknown>;
        if (obj.empty === true) {
            const empty: EmptyContentRef = { empty: true };
            if (typeof obj.label === 'string' && obj.label.length > 0) {
                empty.label = obj.label;
            }
            return empty;
        }
        if (typeof obj.path === 'string' && obj.path.length > 0) {
            const pathRef: PathContentRef = { path: obj.path };
            if (typeof obj.gitRef === 'string' && obj.gitRef.length > 0) {
                pathRef.gitRef = obj.gitRef;
            }
            if (typeof obj.line === 'number' && Number.isFinite(obj.line) && obj.line > 0) {
                pathRef.line = obj.line;
            }
            return pathRef;
        }
    }
    return undefined;
}

export function normalizeUserInteractionLink(link: unknown): UserInteractionLink | undefined {
    if (!link || typeof link !== 'object') {
        return undefined;
    }
    const obj = link as Record<string, unknown>;
    const ref = normalizeContentRef(obj.ref);
    if (!ref) {
        return undefined;
    }
    const normalized: UserInteractionLink = { ref };
    const rightRef = normalizeContentRef(obj.rightRef);
    if (rightRef) {
        normalized.rightRef = rightRef;
    }
    if (typeof obj.label === 'string' && obj.label.length > 0) {
        normalized.label = obj.label;
    }
    if (typeof obj.autoOpen === 'boolean') {
        normalized.autoOpen = obj.autoOpen;
    }
    return normalized;
}
