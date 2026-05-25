// *****************************************************************************
// Copyright (C) 2026 Theia contributors.
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

import * as React from '@theia/core/shared/react';
import { LanguageModel } from '@theia/ai-core/lib/common';

export const LanguageModelOptionContribution = Symbol('LanguageModelOptionContribution');

export interface LanguageModelOptionDecoration {
    labelSuffix?: string;
    title?: string;
    inlineBadge?: React.ReactNode;
}

export interface LanguageModelOptionContribution {
    decorateLanguageModelOption(model: Pick<LanguageModel, 'id'>): LanguageModelOptionDecoration | undefined;
}

export function collectLanguageModelOptionDecorations(
    contributions: readonly LanguageModelOptionContribution[] | undefined,
    model: Pick<LanguageModel, 'id'>
): LanguageModelOptionDecoration {
    const decorations: LanguageModelOptionDecoration[] = [];
    for (const contribution of contributions ?? []) {
        const decoration = contribution.decorateLanguageModelOption(model);
        if (decoration) {
            decorations.push(decoration);
        }
    }
    const inlineBadges = decorations.map(decoration => decoration.inlineBadge).filter(Boolean);
    return {
        labelSuffix: decorations.map(decoration => decoration.labelSuffix).filter(Boolean).join(''),
        title: decorations.find(decoration => decoration.title)?.title,
        inlineBadge: inlineBadges.length > 0 ? inlineBadges : undefined
    };
}
