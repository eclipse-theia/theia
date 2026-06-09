// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export type TranscriptCodeLanguage =
    | 'json'
    | 'grep'
    | 'typescript'
    | 'javascript'
    | 'css'
    | 'shell'
    | 'plain';

const EXTENSION_LANGUAGE: Record<string, TranscriptCodeLanguage> = {
    json: 'json',
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    css: 'css',
    scss: 'css',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
};

export function resolveTranscriptCodeLanguage(filePath?: string, text?: string): TranscriptCodeLanguage {
    if (filePath) {
        const ext = filePath.split('.').pop()?.toLowerCase();
        if (ext && EXTENSION_LANGUAGE[ext]) {
            return EXTENSION_LANGUAGE[ext];
        }
    }
    const trimmed = text?.trim();
    if (trimmed && looksLikeGrepOutput(trimmed)) {
        return 'grep';
    }
    if (trimmed && looksLikeJson(trimmed)) {
        return 'json';
    }
    return 'plain';
}

export function normalizeTranscriptCodeText(text: string, language: TranscriptCodeLanguage): string {
    const clean = text.replace(/\r\n/g, '\n');
    if (language !== 'json') {
        return clean;
    }
    try {
        return JSON.stringify(JSON.parse(clean), undefined, 2);
    } catch {
        return clean;
    }
}

export function createTranscriptCodeView(text: string, language: TranscriptCodeLanguage): HTMLElement {
    const normalized = normalizeTranscriptCodeText(text, language);
    const wrap = document.createElement('div');
    wrap.className = `theia-mobile-agent-code-view theia-mod-${language}`;
    const linesHost = document.createElement('div');
    linesHost.className = 'theia-mobile-agent-code-lines';
    const lines = normalized.split('\n');
    for (let index = 0; index < lines.length; index++) {
        const row = document.createElement('div');
        row.className = 'theia-mobile-agent-code-line';
        const gutter = document.createElement('span');
        gutter.className = 'theia-mobile-agent-code-gutter';
        gutter.textContent = String(index + 1);
        const code = document.createElement('code');
        code.className = 'theia-mobile-agent-code-text';
        appendHighlightedLine(code, lines[index] ?? '', language);
        row.append(gutter, code);
        linesHost.append(row);
    }
    wrap.append(linesHost);
    return wrap;
}

function looksLikeJson(text: string): boolean {
    return (text.startsWith('{') && text.endsWith('}'))
        || (text.startsWith('[') && text.endsWith(']'));
}

function looksLikeGrepOutput(text: string): boolean {
    const sample = text.split('\n').slice(0, 6).filter(line => line.trim());
    if (sample.length === 0) {
        return false;
    }
    const matches = sample.filter(line => /^(?:[^\s:]+\/[^\s]+|\S+\.\w+):\d+/.test(line)).length;
    return matches >= Math.min(2, sample.length);
}

function appendHighlightedLine(host: HTMLElement, line: string, language: TranscriptCodeLanguage): void {
    switch (language) {
        case 'grep':
            appendGrepLine(host, line);
            return;
        case 'json':
            appendJsonLine(host, line);
            return;
        case 'typescript':
        case 'javascript':
            appendScriptLine(host, line);
            return;
        case 'css':
            appendCssLine(host, line);
            return;
        case 'shell':
            appendShellLine(host, line);
            return;
        default:
            host.textContent = line || ' ';
    }
}

function appendSpan(host: HTMLElement, text: string, tokenClass: string): void {
    if (!text) {
        return;
    }
    const span = document.createElement('span');
    span.className = `theia-mobile-agent-token theia-mod-${tokenClass}`;
    span.textContent = text;
    host.append(span);
}

function appendGrepLine(host: HTMLElement, line: string): void {
    const match = line.match(/^(.+?):(\d+)(?::(.*))?$/);
    if (!match) {
        host.textContent = line || ' ';
        return;
    }
    appendSpan(host, match[1], 'path');
    appendSpan(host, ':', 'sep');
    appendSpan(host, match[2], 'line');
    if (match[3] !== undefined) {
        appendSpan(host, ':', 'sep');
        appendSpan(host, match[3], 'content');
    }
}

function appendJsonLine(host: HTMLElement, line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
        host.textContent = ' ';
        return;
    }
    const keyMatch = trimmed.match(/^("(?:\\.|[^"\\])*")\s*(:\s*)?(.*)$/);
    if (keyMatch && keyMatch[2]) {
        appendSpan(host, line.slice(0, line.indexOf(keyMatch[1])), 'plain');
        appendSpan(host, keyMatch[1], 'key');
        appendSpan(host, keyMatch[2], 'sep');
        appendJsonValue(host, keyMatch[3] ?? '');
        return;
    }
    appendJsonValue(host, trimmed);
}

function appendJsonValue(host: HTMLElement, value: string): void {
    const trimmed = value.trim();
    if (!trimmed) {
        return;
    }
    if (/^"(?:\\.|[^"\\])*",?$/.test(trimmed)) {
        appendSpan(host, value, 'string');
        return;
    }
    if (/^-?\d+(?:\.\d+)?,?$/.test(trimmed)) {
        appendSpan(host, value, 'number');
        return;
    }
    if (/^(true|false|null),?$/.test(trimmed)) {
        appendSpan(host, value, 'keyword');
        return;
    }
    if (/^[\[\]{}],?$/.test(trimmed)) {
        appendSpan(host, value, 'sep');
        return;
    }
    host.textContent = value;
}

function appendScriptLine(host: HTMLElement, line: string): void {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) {
        appendSpan(host, line, 'comment');
        return;
    }
    const keywordMatch = line.match(/^(\s*)(export\s+)?(import|export|const|let|var|function|class|interface|type|return|if|else|for|while|switch|case|break|continue|async|await|from)\b(.*)$/);
    if (keywordMatch) {
        appendSpan(host, keywordMatch[1] ?? '', 'plain');
        appendSpan(host, keywordMatch[2] ?? '', 'keyword');
        appendSpan(host, keywordMatch[3] ?? '', 'keyword');
        appendScriptTail(host, keywordMatch[4] ?? '');
        return;
    }
    appendScriptTail(host, line);
}

function appendScriptTail(host: HTMLElement, line: string): void {
    const stringMatch = line.match(/^(\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)(.*)$/);
    if (stringMatch) {
        appendSpan(host, stringMatch[1] ?? '', 'plain');
        appendSpan(host, stringMatch[2], 'string');
        appendScriptTail(host, stringMatch[3] ?? '');
        return;
    }
    host.textContent = line || ' ';
}

function appendCssLine(host: HTMLElement, line: string): void {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('//')) {
        appendSpan(host, line, 'comment');
        return;
    }
    const selectorMatch = line.match(/^([^{]+)(\{?)(.*)$/);
    if (selectorMatch && selectorMatch[2]) {
        appendSpan(host, selectorMatch[1], 'key');
        appendSpan(host, selectorMatch[2], 'sep');
        appendSpan(host, selectorMatch[3] ?? '', 'plain');
        return;
    }
    const propMatch = line.match(/^(\s*)([\w-]+)(\s*:\s*)(.*)$/);
    if (propMatch) {
        appendSpan(host, propMatch[1] ?? '', 'plain');
        appendSpan(host, propMatch[2] ?? '', 'key');
        appendSpan(host, propMatch[3] ?? '', 'sep');
        appendSpan(host, propMatch[4] ?? '', 'string');
        return;
    }
    host.textContent = line || ' ';
}

function appendShellLine(host: HTMLElement, line: string): void {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
        appendSpan(host, line, 'comment');
        return;
    }
    const promptMatch = line.match(/^(\s*\$\s?)(.*)$/);
    if (promptMatch) {
        appendSpan(host, promptMatch[1], 'keyword');
        appendSpan(host, promptMatch[2], 'plain');
        return;
    }
    host.textContent = line || ' ';
}
