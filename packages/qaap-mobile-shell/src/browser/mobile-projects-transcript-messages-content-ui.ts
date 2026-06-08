// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as DOMPurify from '@theia/core/shared/dompurify';
import { nls } from '@theia/core/lib/common/nls';
import { normalizePreviewUrlForSameOrigin } from '@theia/qaap-adapters/lib/browser/qaap-preview-url-utils';
import { collapseExactRepeatedText } from '../common/qaap-qaiq-stream';
import { MobileSnackbar } from './mobile-snackbar';
import type { MobileProjectsTranscriptMessagesHost } from './mobile-projects-transcript-messages-ui';

export class MobileProjectsTranscriptMessagesContentUi {
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

        this.host.transcriptPreviewRequestPending = false;
        this.host.transcriptPreviewRequestRunning = false;
        const latestProject = { ...project, previewUrl };
        this.host.transcriptOpenProject = latestProject;
        this.host.projects = this.host.projects.map(candidate => candidate.id === latestProject.id
            ? { ...candidate, previewUrl }
            : candidate);
        await this.host.projectsService.recordProjectPreviewUrl(latestProject, previewUrl).catch(() => undefined);

        this.host.executionSurfaceTabsUi.selectTranscriptTab('preview', latestProject, summary);
        MobileSnackbar.show(nls.localize('qaap/mobileProjects/previewLinkOpened', 'Preview opened'), { kind: 'success', duration: 1400 });
        return true;
    }


    renderTranscriptMarkdown(host: HTMLElement, content: string): void {
        const html = this.host.transcriptMarkdownIt.render(this.linkifyTranscriptPreviewUrls(this.cleanTranscriptDisplayText(content)));
        host.innerHTML = DOMPurify.sanitize(html, {
            ALLOW_UNKNOWN_PROTOCOLS: true,
        });
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
