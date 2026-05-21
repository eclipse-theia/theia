// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';

export type QaapProjectTemplateKind = 'bundled' | 'github';

export interface QaapProjectTemplate {
    readonly id: string;
    readonly kind: QaapProjectTemplateKind;
    readonly label: string;
    readonly description: string;
    /** For `github` templates: `owner/repo`. Bundled templates use {@link QaapTemplateScaffold} on the backend. */
    readonly repository?: string;
    readonly defaultPrivate?: boolean;
}

/** First-party starters shipped inside `@theia/qaap-mobile-shell/resources/qaap-templates`. */
export const QAAP_PROJECT_TEMPLATES: readonly QaapProjectTemplate[] = [
    {
        id: 'next-app',
        kind: 'bundled',
        label: nls.localize('qaap/templates/nextApp', 'Next.js app'),
        description: nls.localize('qaap/templates/nextAppDesc', 'Qaap Next.js starter — scaffold locally and run dev preview.'),
    },
    {
        id: 'vite-react',
        kind: 'bundled',
        label: nls.localize('qaap/templates/viteReact', 'Vite + React'),
        description: nls.localize('qaap/templates/viteReactDesc', 'Qaap Vite starter for fast mobile preview loops.'),
    },
];

export function findQaapProjectTemplate(id: string): QaapProjectTemplate | undefined {
    return QAAP_PROJECT_TEMPLATES.find(t => t.id === id);
}
