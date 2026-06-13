// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import * as monaco from '@theia/monaco-editor-core';

/** Language ids referenced by vscode.markdown / vscode.html embedded grammar maps but often absent in Theia. */
const QAAP_EMBEDDED_LANGUAGE_STUBS = [
    'coffee',
    'objc',
    'perl6',
    'scala',
    'vb',
    'bat',
    'smarty',
] as const;

@injectable()
export class QaapMonacoEmbeddedLanguageContribution implements FrontendApplicationContribution {

    initialize(): void {
        const registered = new Set(monaco.languages.getLanguages().map(language => language.id));
        for (const id of QAAP_EMBEDDED_LANGUAGE_STUBS) {
            if (!registered.has(id)) {
                monaco.languages.register({ id });
                registered.add(id);
            }
        }
    }
}
