// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { formatToolActivityLabel, parseDiffStatsFromText } from '../common/qaap-agent-conversation-list-metrics';
import { shouldOpenTranscriptToolDetails as shouldOpenTranscriptToolDetailsSegment } from '../common/qaap-agent-transcript-segments';
import type { QaapAgentMessageSegmentDTO } from '../common/qaap-agent-conversation-client';
import type { MobileProjectsTranscriptMessagesContentUi } from './mobile-projects-transcript-messages-content-ui';
import type { MobileProjectsTranscriptMessagesHost } from './mobile-projects-transcript-messages-ui';

export class MobileProjectsTranscriptMessagesResolversUi {
    constructor(
        protected readonly host: MobileProjectsTranscriptMessagesHost,
        protected readonly contentUi: MobileProjectsTranscriptMessagesContentUi,
    ) { }

    resolveTranscriptActivityItems(
        segments: QaapAgentMessageSegmentDTO[],
        includeThinkingSteps = true,
    ): Array<{ readonly label: string; readonly state: 'done' | 'running' | 'thinking' }> {
        const items: Array<{ readonly label: string; readonly state: 'done' | 'running' | 'thinking' }> = [];
        for (const segment of segments) {
            if (segment.type === 'thinking' && segment.content.trim()) {
                if (includeThinkingSteps) {
                    items.push({
                        label: nls.localize('qaap/mobileProjects/transcriptActivityPlanning', 'Planning next steps'),
                        state: 'thinking',
                    });
                }
            } else if (segment.type === 'tool') {
                items.push({
                    label: this.host.localizeActivityLabel(formatToolActivityLabel(segment.name, segment.args)),
                    state: segment.finished ? 'done' : 'running',
                });
            }
        }
        if (segments.some(segment => segment.type === 'text' && segment.content.trim())) {
            items.push({
                label: nls.localize('qaap/mobileProjects/transcriptActivityResponseReady', 'Writing response'),
                state: 'done',
            });
        }
        return items;
    }


    resolveTranscriptChangedFiles(
        segments: QaapAgentMessageSegmentDTO[],
    ): Array<{ readonly path: string; readonly kind: 'edited' | 'created' }> {
        const byPath = new Map<string, 'edited' | 'created'>();
        for (const segment of segments) {
            if (segment.type !== 'tool') {
                continue;
            }
            const kind = this.resolveTranscriptFileChangeKind(segment.name);
            if (!kind) {
                continue;
            }
            const path = this.extractTranscriptToolPath(segment.args);
            if (!path) {
                continue;
            }
            byPath.set(path, kind === 'created' ? 'created' : byPath.get(path) ?? 'edited');
        }
        return [...byPath.entries()].map(([path, kind]) => ({ path, kind }));
    }


    resolveTranscriptVerificationChecks(
        segments: QaapAgentMessageSegmentDTO[],
    ): Array<{ readonly command: string; readonly state: 'passed' | 'failed' | 'running' }> {
        const checks: Array<{ readonly command: string; readonly state: 'passed' | 'failed' | 'running' }> = [];
        for (const segment of segments) {
            if (segment.type !== 'tool' || !this.isTranscriptShellTool(segment.name)) {
                continue;
            }
            const command = this.extractTranscriptToolCommand(segment.args);
            if (!command || !this.isTranscriptVerificationCommand(command)) {
                continue;
            }
            checks.push({
                command: this.compactTranscriptCommand(command),
                state: !segment.finished ? 'running' : this.transcriptToolResultFailed(segment.result) ? 'failed' : 'passed',
            });
        }
        return checks;
    }


    resolveTranscriptDiffStats(
        segments: QaapAgentMessageSegmentDTO[],
    ): { readonly added: number; readonly removed: number } | undefined {
        let added = 0;
        let removed = 0;
        let found = false;
        for (const segment of segments) {
            const texts = segment.type === 'tool'
                ? [segment.args, segment.result ?? '']
                : [segment.content];
            for (const text of texts) {
                const parsed = parseDiffStatsFromText(this.contentUi.cleanTranscriptDisplayText(text));
                if (parsed) {
                    added += parsed.added;
                    removed += parsed.removed;
                    found = true;
                }
            }
        }
        return found ? { added, removed } : undefined;
    }


    resolveTranscriptFileChangeKind(toolName: string): 'edited' | 'created' | undefined {
        const name = toolName.toLowerCase();
        if (name.includes('write') || name.includes('create')) {
            return 'created';
        }
        if (name.includes('edit') || name.includes('patch') || name.includes('replace')) {
            return 'edited';
        }
        return undefined;
    }


    extractTranscriptToolPath(argsJson: string): string | undefined {
        try {
            const args = JSON.parse(argsJson) as Record<string, unknown>;
            const path = typeof args.path === 'string'
                ? args.path
                : typeof args.file_path === 'string'
                    ? args.file_path
                    : typeof args.filename === 'string'
                        ? args.filename
                        : undefined;
            return path ? this.compactTranscriptPath(path) : undefined;
        } catch {
            return undefined;
        }
    }


    extractTranscriptToolCommand(argsJson: string): string | undefined {
        try {
            const args = JSON.parse(argsJson) as Record<string, unknown>;
            return typeof args.command === 'string' && args.command.trim() ? args.command.trim() : undefined;
        } catch {
            return undefined;
        }
    }


    isTranscriptShellTool(toolName: string): boolean {
        const name = toolName.toLowerCase();
        return name.includes('bash') || name.includes('shell') || name.includes('terminal') || name.includes('run_');
    }


    isTranscriptReadLikeTool(toolName: string): boolean {
        const name = toolName.toLowerCase();
        return name.includes('read') || name.includes('grep') || name.includes('glob') || name.includes('search') || name.includes('list');
    }


    isTranscriptVerificationCommand(command: string): boolean {
        return /\b(test|spec|check|lint|compile|build|typecheck|tsc|vitest|jest|mocha|playwright|pytest|cargo test|go test)\b/i.test(command);
    }


    transcriptToolResultFailed(result: string | undefined): boolean {
        if (!result?.trim()) {
            return false;
        }
        return /\b(error|failed|failure|exit\s+[1-9]\d*|code\s+[1-9]\d*)\b/i.test(result)
            && !/\b0\s+failed\b/i.test(result);
    }


    shouldOpenTranscriptToolDetails(segment: { readonly finished: boolean; readonly result?: string }): boolean {
        return shouldOpenTranscriptToolDetailsSegment({
            finished: segment.finished,
            resultFailed: this.transcriptToolResultFailed(segment.result),
        });
    }


    compactTranscriptCommand(command: string): string {
        const clean = command.replace(/\s+/g, ' ').trim();
        return clean.length > 72 ? `${clean.slice(0, 69)}…` : clean;
    }


    formatTranscriptToolResult(result: string): string {
        return this.stripTranscriptLineNumberPrefixes(this.contentUi.cleanTranscriptDisplayText(result));
    }


    stripTranscriptLineNumberPrefixes(text: string): string {
        const lines = text.split('\n');
        const stripped = lines.map(line => line.replace(/^\s*\d+[→:|]\s?/, ''));
        return stripped.some((line, index) => line !== lines[index]) ? stripped.join('\n') : text;
    }


    isTranscriptPureReadTool(toolName: string): boolean {
        const name = toolName.toLowerCase();
        if (name.includes('grep') || name.includes('search') || name.includes('glob')
            || name.includes('list') || name.includes('ls')) {
            return false;
        }
        return name === 'read' || name.endsWith('_read') || /\bread\b/.test(name);
    }


    extractTranscriptToolFullPath(argsJson: string): string | undefined {
        try {
            const args = JSON.parse(argsJson) as Record<string, unknown>;
            const path = typeof args.path === 'string'
                ? args.path
                : typeof args.file_path === 'string'
                    ? args.file_path
                    : typeof args.filename === 'string'
                        ? args.filename
                        : undefined;
            return path?.trim() || undefined;
        } catch {
            return undefined;
        }
    }


    splitTranscriptFilePath(path: string): { fileName: string; dirPath: string } {
        const clean = path.replace(/\\/g, '/').replace(/^\.?\//, '');
        const parts = clean.split('/').filter(Boolean);
        const fileName = parts.pop() ?? clean;
        const dirParts = parts.length > 3 ? parts.slice(-2) : parts;
        return { fileName, dirPath: dirParts.join('/') };
    }


    countTranscriptResultLines(result: string): number {
        const clean = this.stripTranscriptLineNumberPrefixes(this.contentUi.cleanTranscriptDisplayText(result));
        return clean ? clean.split('\n').length : 0;
    }


    shouldShowTranscriptToolResultBody(
        segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
        kind: string,
    ): boolean {
        if (!segment.result?.trim()) {
            return false;
        }
        if (this.isTranscriptPureReadTool(segment.name)) {
            return false;
        }
        return kind === 'searching' || kind === 'editing' || kind === 'tool';
    }


    compactTranscriptPath(path: string): string {
        const clean = path.replace(/\\/g, '/').replace(/^\.?\//, '');
        const parts = clean.split('/').filter(Boolean);
        return parts.length > 3 ? parts.slice(-3).join('/') : clean;
    }


    resolveTranscriptToolKind(toolName: string | undefined): string {
        const name = (toolName ?? 'tool').toLowerCase();
        if (name.includes('bash') || name.includes('shell') || name.includes('terminal') || name.includes('run_')) {
            return 'terminal';
        }
        if (name.includes('write') || name.includes('edit') || name.includes('patch') || name.includes('replace')) {
            return 'editing';
        }
        if (name.includes('grep') || name.includes('search') || name.includes('glob')) {
            return 'searching';
        }
        if (name.includes('read') || name.includes('list') || name.includes('ls')) {
            return 'reading';
        }
        return 'tool';
    }


    resolveTranscriptToolDetail(segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>): string {
        const name = (segment.name ?? 'tool').replace(/_/g, ' ');
        const shortArgs = this.extractTranscriptToolShortArg(segment.args);
        return shortArgs
            ? nls.localize('qaap/mobileProjects/transcriptActivityToolDetailWithArgs', '{0}: {1}', name, shortArgs)
            : nls.localize('qaap/mobileProjects/transcriptActivityToolDetail', 'Calling {0}', name);
    }


    extractTranscriptToolShortArg(argsJson: string): string | undefined {
        try {
            const args = JSON.parse(argsJson) as Record<string, unknown>;
            const value = typeof args.command === 'string' ? args.command
                : typeof args.path === 'string' ? args.path
                    : typeof args.file_path === 'string' ? args.file_path
                        : typeof args.pattern === 'string' ? args.pattern
                            : typeof args.query === 'string' ? args.query
                                : undefined;
            if (!value?.trim()) {
                return undefined;
            }
            const clean = value.trim().replace(/\s+/g, ' ');
            return clean.length > 56 ? `${clean.slice(0, 53)}…` : clean;
        } catch {
            const clean = (argsJson ?? '').trim().replace(/\s+/g, ' ');
            if (!clean || clean === '{}') {
                return undefined;
            }
            return clean.length > 56 ? `${clean.slice(0, 53)}…` : clean;
        }
    }
}
