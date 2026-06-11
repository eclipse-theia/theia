// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as DOMPurify from '@theia/core/shared/dompurify';
import { nls } from '@theia/core/lib/common/nls';
import { normalizePreviewUrlForSameOrigin } from '@theia/qaap-adapters/lib/browser/qaap-preview-url-utils';
import { extractDevPreviewPortFromUrl } from './qaap-transcript-preview-bootstrap';
import { probeQaapDevPreviewPort } from './qaap-dev-preview-client';
import { collapseExactRepeatedText } from '../common/qaap-qaiq-stream';
import { MobileSnackbar } from './mobile-snackbar';
import type { MobileProjectsTranscriptMessagesHost } from './mobile-projects-transcript-messages-ui';

export class MobileProjectsTranscriptMessagesContentUi {
    /** Below this length every streaming tick re-parses markdown; above it we coalesce. */
    protected static readonly STREAMING_MARKDOWN_MIN_CHARS = 1200;
    /** Minimum growth before forcing a markdown re-parse during streaming. */
    protected static readonly STREAMING_MARKDOWN_MIN_GROWTH = 80;
    /** Max delay between full markdown parses while the agent row is still streaming. */
    protected static readonly STREAMING_MARKDOWN_MAX_INTERVAL_MS = 120;

    constructor(protected readonly host: MobileProjectsTranscriptMessagesHost) { }

    normalizeTranscriptPreviewLink(href: string): string | undefined {
        const trimmed = href.trim();
        if (!trimmed) {
            return undefined;
        }
        if (/^\/qaap-dev\/\d{2,5}(?:\/.*)?$/i.test(trimmed)) {
            return window.location.origin + trimmed;
        }
        if (/^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?):\d{2,5}(?:\/.*)?$/i.test(trimmed)) {
            return normalizePreviewUrlForSameOrigin(trimmed);
        }
        try {
            const parsed = new URL(trimmed, window.location.origin);
            if (parsed.origin === window.location.origin && parsed.pathname.startsWith('/qaap-dev/')) {
                return normalizePreviewUrlForSameOrigin(parsed.toString());
            }
        } catch {
            return undefined;
        }
        return undefined;
    }


    async openTranscriptPreviewUrlFromLink(href: string): Promise<boolean> {
        const previewUrl = this.normalizeTranscriptPreviewLink(href);
        const summary = this.host.transcriptComposerSummary ?? this.host.transcriptOpenSummary;
        const project = this.host.transcriptOpenProject;
        if (!previewUrl || !summary || !project) {
            return false;
        }

        const port = extractDevPreviewPortFromUrl(previewUrl);
        let verifiedUrl = previewUrl;
        if (port !== undefined) {
            const probe = await probeQaapDevPreviewPort(port);
            if (!probe.ready) {
                return false;
            }
            verifiedUrl = normalizePreviewUrlForSameOrigin(probe.previewUrl);
        }
        this.host.transcriptPreviewRequestPending = false;
        this.host.transcriptPreviewRequestRunning = false;
        const latestProject = { ...project, previewUrl: verifiedUrl };
        this.host.transcriptOpenProject = latestProject;
        this.host.projects = this.host.projects.map(candidate => candidate.id === latestProject.id
            ? { ...candidate, previewUrl: verifiedUrl }
            : candidate);
        await this.host.projectsService.recordProjectPreviewUrl(latestProject, verifiedUrl).catch(() => undefined);

        this.host.executionSurfaceTabsUi.selectTranscriptTab('preview', latestProject, summary);
        MobileSnackbar.show(nls.localize('qaap/mobileProjects/previewLinkOpened', 'Preview opened'), { kind: 'success', duration: 1400 });
        return true;
    }


    renderTranscriptMarkdown(host: HTMLElement, content: string): void {
        const clean = this.cleanTranscriptDisplayText(content).trim();
        const html = this.host.transcriptMarkdownIt.render(this.linkifyTranscriptPreviewUrls(clean));
        host.innerHTML = DOMPurify.sanitize(html, {
            ALLOW_UNKNOWN_PROTOCOLS: true,
        });
        host.dataset.transcriptStreamParsedLen = String(clean.length);
        host.dataset.transcriptStreamParsedAt = String(Date.now());
        host.querySelector('.theia-mobile-agent-streaming-text-tail')?.remove();
        this.attachTranscriptMarkdownLinkHandler(host);
    }

    /** Throttled markdown for long streaming agent text — appends a plain tail between full parses. */
    renderTranscriptStreamingMarkdown(host: HTMLElement, content: string): void {
        const clean = this.cleanTranscriptDisplayText(content).trim();
        const minChars = MobileProjectsTranscriptMessagesContentUi.STREAMING_MARKDOWN_MIN_CHARS;
        if (clean.length < minChars) {
            this.renderTranscriptMarkdown(host, clean);
            return;
        }
        const lastParsedLen = Number(host.dataset.transcriptStreamParsedLen ?? '0');
        const lastParsedAt = Number(host.dataset.transcriptStreamParsedAt ?? '0');
        const now = Date.now();
        const growth = clean.length - lastParsedLen;
        const maxInterval = MobileProjectsTranscriptMessagesContentUi.STREAMING_MARKDOWN_MAX_INTERVAL_MS;
        const minGrowth = MobileProjectsTranscriptMessagesContentUi.STREAMING_MARKDOWN_MIN_GROWTH;
        if (growth >= minGrowth || now - lastParsedAt >= maxInterval || lastParsedLen === 0) {
            this.renderTranscriptMarkdown(host, clean);
            return;
        }
        let tail = host.querySelector<HTMLElement>('.theia-mobile-agent-streaming-text-tail');
        if (!tail) {
            tail = document.createElement('span');
            tail.className = 'theia-mobile-agent-streaming-text-tail';
            host.append(tail);
        }
        tail.textContent = clean.slice(lastParsedLen);
    }

    protected attachTranscriptMarkdownLinkHandler(host: HTMLElement): void {
        host.addEventListener('click', event => {
            let target = event.target as HTMLElement | null;
            while (target && target.tagName !== 'A') {
                target = target.parentElement;
            }
            if (!target) {
                return;
            }
            const href = target.getAttribute('href');
            if (!href) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            void this.openTranscriptPreviewUrlFromLink(href).then(handled => {
                if (!handled) {
                    window.open(href, '_blank', 'noopener');
                }
            });
        });
    }


    linkifyTranscriptPreviewUrls(content: string | undefined | null): string {
        const text = content ?? '';
        return text.replace(
            /(^|[\s(])((?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?):\d{2,5}(?:\/[^\s\x60<)]*)?|\/qaap-dev\/\d{2,5}(?:\/[^\s\x60<)]*)?)/gi,
            (match, prefix: string, url: string, offset: number) => {
                const before = text.slice(0, offset);
                if (/\[[^\]]*$/.test(before) || /\]\([^)]*$/.test(before)) {
                    return match;
                }
                return prefix + '[' + url + '](' + url + ')';
            },
        );
    }


    cleanTranscriptDisplayText(content: string | undefined | null): string {
        const text = content ?? '';
        return collapseExactRepeatedText(text
            .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
            .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, ''));
    }

}
