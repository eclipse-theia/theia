// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { PreferenceTreeModel } from '../../preference-tree-model';
import { PreferenceTreeLabelProvider } from '../../util/preference-tree-label-provider';
import * as markdownit from '@theia/core/shared/markdown-it';

@injectable()
export class PreferenceMarkdownRenderer {

    @inject(PreferenceTreeModel) protected readonly model: PreferenceTreeModel;
    @inject(PreferenceTreeLabelProvider) protected readonly labelProvider: PreferenceTreeLabelProvider;

    protected _renderer?: markdownit;

    render(text: string): string {
        return this.getRenderer().render(text);
    }

    renderInline(text: string): string {
        return this.getRenderer().renderInline(text);
    }

    protected getRenderer(): markdownit {
        this._renderer ??= this.buildMarkdownRenderer();
        return this._renderer;
    }

    protected buildMarkdownRenderer(): markdownit {
        const engine = markdownit();
        const inlineCode = engine.renderer.rules.code_inline;

        engine.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
            const token = tokens[idx];
            const content = token.content;
            if (content.startsWith('#') && content.endsWith('#')) {
                const preferenceId = content.substring(1, content.length - 1);
                const preferenceNode = this.model.getNodeFromPreferenceId(preferenceId);
                if (preferenceNode) {
                    let name = this.labelProvider.getName(preferenceNode);
                    const prefix = this.labelProvider.getPrefix(preferenceNode, true);
                    if (prefix) {
                        name = prefix + name;
                    }
                    return `<a title="${preferenceId}" href="preference:${preferenceId}">${name}</a>`;
                } else {
                    console.warn(`Linked preference "${preferenceId}" not found.`);
                }
            }
            return inlineCode ? inlineCode(tokens, idx, options, env, self) : '';
        };
        return engine;
    }
}
