// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Lightweight Tool UI payload detection (no Zod — port-friendly JSON shapes). */

export interface TranscriptToolUiCodeBlockPayload {
    readonly kind: 'code_block';
    readonly id?: string;
    readonly code: string;
    readonly language?: string;
    readonly filename?: string;
}

export interface TranscriptToolUiLinkPreviewPayload {
    readonly kind: 'link_preview';
    readonly id?: string;
    readonly href: string;
    readonly title?: string;
    readonly description?: string;
    readonly image?: string;
    readonly domain?: string;
}

export interface TranscriptToolUiCitationPayload {
    readonly kind: 'citation';
    readonly id?: string;
    readonly href: string;
    readonly title: string;
    readonly snippet?: string;
    readonly domain?: string;
}

export interface TranscriptToolUiOptionListPayload {
    readonly kind: 'option_list';
    readonly id?: string;
    readonly options: ReadonlyArray<{ readonly id: string; readonly label: string; readonly description?: string }>;
    readonly selectionMode?: 'single' | 'multi';
    readonly choice?: string | readonly string[] | null;
}

export interface TranscriptToolUiQuestionFlowPayload {
    readonly kind: 'question_flow';
    readonly id?: string;
    readonly questions: ReadonlyArray<{
        readonly id: string;
        readonly question: string;
        readonly header?: string;
        readonly options: ReadonlyArray<{ readonly id: string; readonly label: string; readonly description?: string }>;
        readonly multiSelect?: boolean;
    }>;
    readonly answers?: Readonly<Record<string, string>>;
}

export type TranscriptToolUiPayload =
    | TranscriptToolUiCodeBlockPayload
    | TranscriptToolUiLinkPreviewPayload
    | TranscriptToolUiCitationPayload
    | TranscriptToolUiOptionListPayload
    | TranscriptToolUiQuestionFlowPayload;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== undefined && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function tryParseJsonRecord(text: string): Record<string, unknown> | undefined {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return undefined;
    }
    try {
        const parsed: unknown = JSON.parse(trimmed);
        return isRecord(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function parseOptionList(record: Record<string, unknown>): TranscriptToolUiOptionListPayload | undefined {
    const optionsRaw = record.options;
    if (!Array.isArray(optionsRaw) || optionsRaw.length === 0) {
        return undefined;
    }
    const options: Array<{ id: string; label: string; description?: string }> = [];
    for (const entry of optionsRaw) {
        if (!isRecord(entry)) {
            return undefined;
        }
        const id = asNonEmptyString(entry.id);
        const label = asNonEmptyString(entry.label);
        if (!id || !label) {
            return undefined;
        }
        options.push({
            id,
            label,
            description: asNonEmptyString(entry.description),
        });
    }
    const selectionMode = record.selectionMode === 'multi' ? 'multi' : record.selectionMode === 'single' ? 'single' : undefined;
    let choice: string | string[] | null | undefined;
    if (record.choice === null) {
        choice = null;
    } else if (typeof record.choice === 'string') {
        choice = record.choice;
    } else if (Array.isArray(record.choice)) {
        choice = record.choice.filter((item): item is string => typeof item === 'string');
    }
    return {
        kind: 'option_list',
        id: asNonEmptyString(record.id),
        options,
        selectionMode,
        choice,
    };
}

function parseQuestionFlow(record: Record<string, unknown>): TranscriptToolUiQuestionFlowPayload | undefined {
    const questionsRaw = record.questions;
    if (!Array.isArray(questionsRaw) || questionsRaw.length === 0) {
        return undefined;
    }
    const questions: TranscriptToolUiQuestionFlowPayload['questions'][number][] = [];
    for (const [index, entry] of questionsRaw.entries()) {
        if (!isRecord(entry)) {
            return undefined;
        }
        const question = asNonEmptyString(entry.question);
        const optionsRaw = entry.options;
        if (!question || !Array.isArray(optionsRaw) || optionsRaw.length === 0) {
            return undefined;
        }
        const options: Array<{ id: string; label: string; description?: string }> = [];
        for (const [optionIndex, optionEntry] of optionsRaw.entries()) {
            if (!isRecord(optionEntry)) {
                return undefined;
            }
            const label = asNonEmptyString(optionEntry.label);
            if (!label) {
                return undefined;
            }
            options.push({
                id: asNonEmptyString(optionEntry.id) ?? `opt-${index}-${optionIndex}`,
                label,
                description: asNonEmptyString(optionEntry.description),
            });
        }
        questions.push({
            id: asNonEmptyString(entry.id) ?? asNonEmptyString(entry.header) ?? `q-${index}`,
            question,
            header: asNonEmptyString(entry.header),
            options,
            multiSelect: entry.multiSelect === true,
        });
    }
    const answers = isRecord(record.answers)
        ? Object.fromEntries(Object.entries(record.answers).filter((entry): entry is [string, string] =>
            typeof entry[0] === 'string' && typeof entry[1] === 'string',
        ))
        : undefined;
    return {
        kind: 'question_flow',
        id: asNonEmptyString(record.id),
        questions,
        answers,
    };
}

export function tryParseTranscriptToolUiPayload(value: unknown): TranscriptToolUiPayload | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const code = asNonEmptyString(value.code);
    if (code !== undefined && (value.language !== undefined || value.filename !== undefined || asNonEmptyString(value.id)?.includes('code'))) {
        return {
            kind: 'code_block',
            id: asNonEmptyString(value.id),
            code,
            language: asNonEmptyString(value.language),
            filename: asNonEmptyString(value.filename),
        };
    }
    const href = asNonEmptyString(value.href);
    const title = asNonEmptyString(value.title);
    if (href && /^https?:\/\//i.test(href)) {
        if (title && (value.snippet !== undefined || value.type !== undefined || value.author !== undefined)) {
            return {
                kind: 'citation',
                id: asNonEmptyString(value.id),
                href,
                title,
                snippet: asNonEmptyString(value.snippet),
                domain: asNonEmptyString(value.domain),
            };
        }
        if (value.description !== undefined || value.image !== undefined || title) {
            return {
                kind: 'link_preview',
                id: asNonEmptyString(value.id),
                href,
                title,
                description: asNonEmptyString(value.description),
                image: asNonEmptyString(value.image),
                domain: asNonEmptyString(value.domain),
            };
        }
    }
    const optionList = parseOptionList(value);
    if (optionList) {
        return optionList;
    }
    const questionFlow = parseQuestionFlow(value);
    if (questionFlow) {
        return questionFlow;
    }
    if (code !== undefined) {
        return {
            kind: 'code_block',
            id: asNonEmptyString(value.id),
            code,
            language: asNonEmptyString(value.language),
            filename: asNonEmptyString(value.filename),
        };
    }
    return undefined;
}

export function tryParseTranscriptToolUiPayloadFromText(text: string): TranscriptToolUiPayload | undefined {
    const record = tryParseJsonRecord(text);
    return record ? tryParseTranscriptToolUiPayload(record) : undefined;
}

/** Claude `AskUserQuestion` tool args → question flow card. */
export function tryParseAskUserQuestionArgs(args: string): TranscriptToolUiQuestionFlowPayload | undefined {
    const record = tryParseJsonRecord(args);
    if (!record) {
        return undefined;
    }
    return parseQuestionFlow(record);
}

export function resolveTranscriptToolUiPayloadFromSegment(
    toolName: string,
    args: string,
    result?: string,
): TranscriptToolUiPayload | undefined {
    const normalizedName = toolName.toLowerCase().replace(/_/g, '-');
    if (normalizedName.includes('askuserquestion') || normalizedName.includes('question-flow')) {
        const fromArgs = tryParseAskUserQuestionArgs(args);
        if (fromArgs) {
            return fromArgs;
        }
    }
    if (result?.trim()) {
        const fromResult = tryParseTranscriptToolUiPayloadFromText(result);
        if (fromResult) {
            return fromResult;
        }
    }
    const fromArgs = tryParseTranscriptToolUiPayloadFromText(args);
    if (fromArgs) {
        return fromArgs;
    }
    if (normalizedName.includes('option-list')) {
        return tryParseTranscriptToolUiPayloadFromText(args);
    }
    if (normalizedName.includes('link-preview')) {
        return tryParseTranscriptToolUiPayloadFromText(result ?? args);
    }
    if (normalizedName.includes('citation')) {
        return tryParseTranscriptToolUiPayloadFromText(result ?? args);
    }
    if (normalizedName.includes('code-block')) {
        return tryParseTranscriptToolUiPayloadFromText(result ?? args);
    }
    return undefined;
}
