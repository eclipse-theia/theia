// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Returns true when transcript text should render as Markdown, not a terminal/log panel. */
export function looksLikeTranscriptMarkdown(content: string): boolean {
    if (!content.trim()) {
        return false;
    }
    if (/^#{1,6}\s+\S/m.test(content)) {
        return true;
    }
    if (/^```/m.test(content)) {
        return true;
    }
    if (/\*\*[^*\n]+\*\*/.test(content)) {
        return true;
    }
    if (/^[-*+]\s+\S/m.test(content)) {
        return true;
    }
    if (/^\d+\.\s+\S/m.test(content)) {
        return true;
    }
    if (/^>\s+\S/m.test(content)) {
        return true;
    }
    if (/\[[^\]]+\]\([^)]+\)/.test(content)) {
        return true;
    }
    return false;
}

/** Heuristic: multi-line stderr / stack traces that belong in a collapsible terminal panel. */
export function isTranscriptTerminalOutputText(content: string): boolean {
    if (looksLikeTranscriptMarkdown(content)) {
        return false;
    }
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 4) {
        return false;
    }
    const signals = lines.filter(line =>
        /file:\/\/\/|node_modules\/[^\s:]+\.\w+:\d+|^\s*at\s+(?:\S+\.)?\S+\s*\(|Traceback \(most recent call last\)|The above error occurred|React will try to recreate/i.test(line)
        || /^(?:\w+)?Error:\s|^(?:\w+)?Exception:\s/i.test(line)
    ).length;
    return signals >= 2;
}

/** Whether a terminal panel should use the failed/error chrome and label. */
export function isTranscriptErrorOutput(content: string): boolean {
    return /Traceback \(most recent call last\)|The above error occurred|React will try to recreate/i.test(content)
        || /^(?:\w+)?(?:Error|Exception):\s/m.test(content)
        || /^\s*at\s+(?:\S+\.)?\S+\s*\(/m.test(content);
}
