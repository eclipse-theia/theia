// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { extractTranscriptDiffCard, type QaapTranscriptDiffCard } from '../common/qaap-agent-transcript-segments';
import {
    resolveTranscriptToolUiPayloadFromSegment,
    tryParseTranscriptToolUiPayloadFromText,
    type TranscriptToolUiCitationPayload,
    type TranscriptToolUiCodeBlockPayload,
    type TranscriptToolUiLinkPreviewPayload,
    type TranscriptToolUiOptionListPayload,
    type TranscriptToolUiPayload,
    type TranscriptToolUiQuestionFlowPayload,
} from '../common/qaap-transcript-tool-ui-payloads';
import { createTranscriptCodeView, resolveTranscriptCodeLanguage } from './qaap-transcript-code-view';

export const TRANSCRIPT_CODE_BLOCK_CARD_CLASS = 'theia-mobile-agent-code-block-card';
export const TRANSCRIPT_LINK_PREVIEW_CARD_CLASS = 'theia-mobile-agent-link-preview-card';
export const TRANSCRIPT_CITATION_CARD_CLASS = 'theia-mobile-agent-citation-card';
export const TRANSCRIPT_OPTION_LIST_CARD_CLASS = 'theia-mobile-agent-option-list-card';
export const TRANSCRIPT_QUESTION_FLOW_CARD_CLASS = 'theia-mobile-agent-question-flow-card';

function appendCopyButton(host: HTMLElement, copyFrom: () => string): void {
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'theia-mobile-agent-rich-copy codicon codicon-copy';
    const copyLabel = nls.localize('qaap/mobileProjects/transcriptShellCopy', 'Copy');
    copyBtn.setAttribute('aria-label', copyLabel);
    const tip = document.createElement('span');
    tip.className = 'theia-mobile-agent-rich-copy-tip';
    tip.setAttribute('role', 'tooltip');
    tip.textContent = nls.localize('qaap/mobileProjects/transcriptShellCopied', 'Copied');
    copyBtn.append(tip);
    copyBtn.addEventListener('click', event => {
        event.stopPropagation();
        event.preventDefault();
        const text = copyFrom().trim();
        if (!text) {
            return;
        }
        void navigator.clipboard.writeText(text).then(() => {
            copyBtn.classList.add('theia-mod-copied');
            window.setTimeout(() => copyBtn.classList.remove('theia-mod-copied'), 1400);
        }).catch(() => undefined);
    });
    host.append(copyBtn);
}

function resolveHostname(href: string): string {
    try {
        return new URL(href).hostname.replace(/^www\./, '');
    } catch {
        return href;
    }
}

export function buildTranscriptCodeBlockCard(payload: TranscriptToolUiCodeBlockPayload): HTMLElement {
    const card = document.createElement('div');
    card.className = TRANSCRIPT_CODE_BLOCK_CARD_CLASS;
    const head = document.createElement('div');
    head.className = 'theia-mobile-agent-code-block-card-head';
    const language = document.createElement('span');
    language.className = 'theia-mobile-agent-code-block-card-language';
    language.textContent = payload.filename
        ?? (payload.language && payload.language !== 'text' ? payload.language : 'Code');
    head.append(language);
    appendCopyButton(head, () => payload.code);
    const separator = document.createElement('div');
    separator.className = 'theia-mobile-agent-rich-card-sep';
    separator.setAttribute('role', 'separator');
    const body = document.createElement('div');
    body.className = 'theia-mobile-agent-code-block-card-body';
    const lang = resolveTranscriptCodeLanguage(payload.filename, payload.code);
    body.append(createTranscriptCodeView(payload.code, lang));
    card.append(head, separator, body);
    return card;
}

export function buildTranscriptLinkPreviewCard(payload: TranscriptToolUiLinkPreviewPayload): HTMLElement {
    const card = document.createElement('a');
    card.className = TRANSCRIPT_LINK_PREVIEW_CARD_CLASS;
    card.href = payload.href;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    const head = document.createElement('div');
    head.className = 'theia-mobile-agent-link-preview-card-head';
    if (payload.image) {
        const image = document.createElement('img');
        image.className = 'theia-mobile-agent-link-preview-card-image';
        image.src = payload.image;
        image.alt = '';
        image.loading = 'lazy';
        head.append(image);
    }
    const copy = document.createElement('div');
    copy.className = 'theia-mobile-agent-link-preview-card-copy';
    const domain = document.createElement('div');
    domain.className = 'theia-mobile-agent-link-preview-card-domain';
    domain.textContent = payload.domain ?? resolveHostname(payload.href);
    const title = document.createElement('div');
    title.className = 'theia-mobile-agent-link-preview-card-title';
    title.textContent = payload.title ?? payload.href;
    copy.append(domain, title);
    if (payload.description) {
        const description = document.createElement('p');
        description.className = 'theia-mobile-agent-link-preview-card-description';
        description.textContent = payload.description;
        copy.append(description);
    }
    head.append(copy);
    card.append(head);
    return card;
}

export function buildTranscriptCitationCard(payload: TranscriptToolUiCitationPayload): HTMLElement {
    const card = document.createElement('a');
    card.className = TRANSCRIPT_CITATION_CARD_CLASS;
    card.href = payload.href;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    const head = document.createElement('div');
    head.className = 'theia-mobile-agent-citation-card-head';
    const icon = document.createElement('span');
    icon.className = 'theia-mobile-agent-citation-card-icon codicon codicon-link-external';
    icon.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('div');
    copy.className = 'theia-mobile-agent-citation-card-copy';
    const domain = document.createElement('div');
    domain.className = 'theia-mobile-agent-citation-card-domain';
    domain.textContent = payload.domain ?? resolveHostname(payload.href);
    const title = document.createElement('div');
    title.className = 'theia-mobile-agent-citation-card-title';
    title.textContent = payload.title;
    copy.append(domain, title);
    if (payload.snippet) {
        const snippet = document.createElement('p');
        snippet.className = 'theia-mobile-agent-citation-card-snippet';
        snippet.textContent = payload.snippet;
        copy.append(snippet);
    }
    head.append(icon, copy);
    card.append(head);
    return card;
}

export function buildTranscriptOptionListCard(payload: TranscriptToolUiOptionListPayload): HTMLElement {
    const card = document.createElement('div');
    card.className = TRANSCRIPT_OPTION_LIST_CARD_CLASS;
    const head = document.createElement('div');
    head.className = 'theia-mobile-agent-option-list-card-head';
    head.textContent = nls.localize('qaap/mobileProjects/transcriptOptionListTitle', 'Choose an option');
    card.append(head);
    const list = document.createElement('div');
    list.className = 'theia-mobile-agent-option-list-card-options';
    const selected = new Set<string>();
    if (typeof payload.choice === 'string') {
        selected.add(payload.choice);
    } else if (Array.isArray(payload.choice)) {
        for (const id of payload.choice) {
            selected.add(id);
        }
    }
    for (const option of payload.options) {
        const row = document.createElement('div');
        row.className = 'theia-mobile-agent-option-list-card-option';
        if (selected.has(option.id)) {
            row.classList.add('theia-mod-selected');
        }
        const marker = document.createElement('span');
        marker.className = 'theia-mobile-agent-option-list-card-marker';
        marker.textContent = selected.has(option.id) ? '✓' : payload.selectionMode === 'multi' ? '□' : '○';
        const copy = document.createElement('div');
        copy.className = 'theia-mobile-agent-option-list-card-option-copy';
        const label = document.createElement('div');
        label.className = 'theia-mobile-agent-option-list-card-label';
        label.textContent = option.label;
        copy.append(label);
        if (option.description) {
            const description = document.createElement('div');
            description.className = 'theia-mobile-agent-option-list-card-description';
            description.textContent = option.description;
            copy.append(description);
        }
        row.append(marker, copy);
        list.append(row);
    }
    card.append(list);
    return card;
}

export function buildTranscriptQuestionFlowCard(payload: TranscriptToolUiQuestionFlowPayload): HTMLElement {
    const card = document.createElement('div');
    card.className = TRANSCRIPT_QUESTION_FLOW_CARD_CLASS;
    const head = document.createElement('div');
    head.className = 'theia-mobile-agent-question-flow-card-head';
    head.textContent = nls.localize('qaap/mobileProjects/transcriptQuestionFlowTitle', 'Questions');
    card.append(head);
    const steps = document.createElement('div');
    steps.className = 'theia-mobile-agent-question-flow-card-steps';
    for (const [index, question] of payload.questions.entries()) {
        const step = document.createElement('div');
        step.className = 'theia-mobile-agent-question-flow-card-step';
        const stepHead = document.createElement('div');
        stepHead.className = 'theia-mobile-agent-question-flow-card-step-head';
        const indexEl = document.createElement('span');
        indexEl.className = 'theia-mobile-agent-question-flow-card-step-index';
        indexEl.textContent = String(index + 1);
        const title = document.createElement('span');
        title.className = 'theia-mobile-agent-question-flow-card-step-title';
        title.textContent = question.header ?? question.question;
        stepHead.append(indexEl, title);
        step.append(stepHead);
        const prompt = document.createElement('p');
        prompt.className = 'theia-mobile-agent-question-flow-card-question';
        prompt.textContent = question.question;
        step.append(prompt);
        const answer = payload.answers?.[question.id];
        const options = document.createElement('div');
        options.className = 'theia-mobile-agent-question-flow-card-options';
        for (const option of question.options) {
            const row = document.createElement('div');
            row.className = 'theia-mobile-agent-question-flow-card-option';
            const selected = answer === option.label || answer === option.id;
            if (selected) {
                row.classList.add('theia-mod-selected');
            }
            const marker = document.createElement('span');
            marker.className = 'theia-mobile-agent-question-flow-card-marker';
            marker.textContent = selected ? '✓' : question.multiSelect ? '□' : '○';
            const label = document.createElement('span');
            label.className = 'theia-mobile-agent-question-flow-card-option-label';
            label.textContent = option.label;
            row.append(marker, label);
            options.append(row);
        }
        step.append(options);
        steps.append(step);
    }
    card.append(steps);
    return card;
}

export function buildTranscriptDiffCardFromExtracted(
    card: QaapTranscriptDiffCard,
    options: { readonly fileName?: string; readonly path?: string; readonly rawDiff?: string },
): HTMLElement {
    const details = document.createElement('details');
    details.className = 'theia-mobile-agent-diff-card theia-mod-done';
    details.open = true;
    const summary = document.createElement('summary');
    summary.className = 'theia-mobile-agent-diff-card-head';
    const chevron = document.createElement('span');
    chevron.className = 'theia-mobile-agent-diff-card-chevron codicon codicon-chevron-right';
    chevron.setAttribute('aria-hidden', 'true');
    const iconWrap = document.createElement('span');
    iconWrap.className = 'theia-mobile-agent-diff-card-icon-wrap';
    const icon = document.createElement('span');
    icon.className = 'theia-mobile-agent-diff-card-icon codicon codicon-diff';
    icon.setAttribute('aria-hidden', 'true');
    iconWrap.append(icon);
    const label = document.createElement('span');
    label.className = 'theia-mobile-agent-diff-card-label';
    label.textContent = options.fileName
        ? nls.localize('qaap/mobileProjects/diffCardEditedFile', 'Edited {0}', options.fileName)
        : nls.localize('qaap/mobileProjects/diffCardEdited', 'Edited a file');
    const stats = document.createElement('span');
    stats.className = 'theia-mobile-agent-diff-card-stats';
    const addedBadge = document.createElement('span');
    addedBadge.className = 'theia-mobile-agent-diff-card-added';
    addedBadge.textContent = `+${card.added}`;
    const removedBadge = document.createElement('span');
    removedBadge.className = 'theia-mobile-agent-diff-card-removed';
    removedBadge.textContent = `−${card.removed}`;
    stats.append(addedBadge, removedBadge);
    summary.append(chevron, iconWrap, label, stats);
    if (options.rawDiff) {
        const tail = document.createElement('div');
        tail.className = 'theia-mobile-agent-shell-tail';
        appendCopyButton(tail, () => options.rawDiff!);
        summary.append(tail);
    }
    details.append(summary);
    const body = document.createElement('div');
    body.className = 'theia-mobile-agent-diff-card-body';
    if (options.path) {
        const pathBar = document.createElement('div');
        pathBar.className = 'theia-mobile-agent-diff-card-path';
        pathBar.textContent = options.path;
        body.append(pathBar);
    }
    const lines = document.createElement('pre');
    lines.className = 'theia-mobile-agent-diff-card-lines';
    for (const line of card.lines) {
        const row = document.createElement('div');
        row.className = `theia-mobile-agent-diff-card-line theia-mod-${line.kind}`;
        const lineNo = document.createElement('span');
        lineNo.className = 'theia-mobile-agent-diff-card-lineno';
        lineNo.textContent = line.lineNumber !== undefined ? String(line.lineNumber) : '';
        const marker = document.createElement('span');
        marker.className = 'theia-mobile-agent-diff-card-marker';
        marker.textContent = line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' ';
        const text = document.createElement('span');
        text.className = 'theia-mobile-agent-diff-card-text';
        text.textContent = line.text;
        row.append(lineNo, marker, text);
        lines.append(row);
    }
    body.append(lines);
    if (card.truncated) {
        const more = document.createElement('div');
        more.className = 'theia-mobile-agent-diff-card-more';
        more.textContent = nls.localize('qaap/mobileProjects/diffCardTruncated', '… more changes not shown');
        body.append(more);
    }
    details.append(body);
    return details;
}

export function buildTranscriptToolUiPayloadElement(payload: TranscriptToolUiPayload): HTMLElement {
    switch (payload.kind) {
        case 'code_block':
            return buildTranscriptCodeBlockCard(payload);
        case 'link_preview':
            return buildTranscriptLinkPreviewCard(payload);
        case 'citation':
            return buildTranscriptCitationCard(payload);
        case 'option_list':
            return buildTranscriptOptionListCard(payload);
        case 'question_flow':
            return buildTranscriptQuestionFlowCard(payload);
    }
}

export function tryBuildTranscriptRichToolBody(text: string, toolName?: string, args?: string): HTMLElement | undefined {
    const payload = toolName !== undefined && args !== undefined
        ? resolveTranscriptToolUiPayloadFromSegment(toolName, args, text)
        : tryParseTranscriptToolUiPayloadFromText(text);
    if (payload) {
        return buildTranscriptToolUiPayloadElement(payload);
    }
    const diff = extractTranscriptDiffCard(text);
    if (diff) {
        return buildTranscriptDiffCardFromExtracted(diff, { rawDiff: text });
    }
    return undefined;
}

function inferFenceLanguage(pre: HTMLPreElement): string | undefined {
    const fromClass = [...pre.classList].map(token => /^language-(.+)$/.exec(token)?.[1]).find(Boolean);
    if (fromClass) {
        return fromClass;
    }
    const code = pre.querySelector('code');
    if (!code) {
        return undefined;
    }
    return [...code.classList].map(token => /^language-(.+)$/.exec(token)?.[1]).find(Boolean);
}

function wrapMarkdownCodeBlock(pre: HTMLPreElement): void {
    if (pre.closest(`.${TRANSCRIPT_CODE_BLOCK_CARD_CLASS}`)) {
        return;
    }
    const code = pre.querySelector('code');
    const text = (code ?? pre).textContent ?? '';
    if (!text.trim()) {
        return;
    }
    const language = inferFenceLanguage(pre);
    const card = buildTranscriptCodeBlockCard({
        kind: 'code_block',
        code: text,
        language,
    });
    pre.replaceWith(card);
}

function tryLinkPreviewFromAnchor(anchor: HTMLAnchorElement): TranscriptToolUiLinkPreviewPayload | undefined {
    const href = anchor.getAttribute('href')?.trim();
    if (!href || !/^https?:\/\//i.test(href)) {
        return undefined;
    }
    return {
        kind: 'link_preview',
        href,
        title: anchor.textContent?.trim() || undefined,
        domain: resolveHostname(href),
    };
}

function tryCitationFromBlockquote(block: HTMLElement): TranscriptToolUiCitationPayload | undefined {
    const anchor = block.querySelector('a[href]');
    const href = anchor?.getAttribute('href')?.trim();
    if (!href || !/^https?:\/\//i.test(href)) {
        return undefined;
    }
    const anchorText = anchor?.textContent?.trim();
    const title = anchorText
        || block.querySelector('strong')?.textContent?.trim()
        || resolveHostname(href);
    const snippet = block.textContent?.replace(title, '').trim();
    return {
        kind: 'citation',
        href,
        title,
        snippet: snippet && snippet !== href ? snippet : undefined,
        domain: resolveHostname(href),
    };
}

/** Upgrade rendered markdown with Tool UI rich surfaces (code block, link preview, citation). */
export function enhanceTranscriptMarkdownRichContent(host: HTMLElement): void {
    host.querySelectorAll('pre').forEach(node => {
        if (node instanceof HTMLPreElement) {
            wrapMarkdownCodeBlock(node);
        }
    });
    host.querySelectorAll('blockquote').forEach(node => {
        if (!(node instanceof HTMLElement) || node.closest(`.${TRANSCRIPT_CITATION_CARD_CLASS}`)) {
            return;
        }
        const payload = tryCitationFromBlockquote(node);
        if (payload) {
            node.replaceWith(buildTranscriptCitationCard(payload));
        }
    });
    host.querySelectorAll('p').forEach(node => {
        if (!(node instanceof HTMLElement) || node.childElementCount !== 1) {
            return;
        }
        const anchor = node.firstElementChild;
        if (!(anchor instanceof HTMLAnchorElement) || anchor.tagName !== 'A') {
            return;
        }
        const payload = tryLinkPreviewFromAnchor(anchor);
        if (payload) {
            node.replaceWith(buildTranscriptLinkPreviewCard(payload));
        }
    });
}
