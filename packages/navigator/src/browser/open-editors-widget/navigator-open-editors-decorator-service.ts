/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { TreeDecorator, AbstractTreeDecoratorService, TreeDecoration } from '@theia/core/lib/browser/tree/tree-decorator';
import { NavigatorTreeDecorator } from '../navigator-decorator-service';
import { Tree } from '@theia/core/lib/browser';

export const OpenEditorsTreeDecorator = Symbol('OpenEditorsTreeDecorator');

@injectable()
export class OpenEditorsTreeDecoratorService extends AbstractTreeDecoratorService {
    protected problemDecorator: TreeDecorator | undefined;

    protected globalColorMap = new Map<string, string>();

    constructor(@inject(ContributionProvider) @named(OpenEditorsTreeDecorator) protected readonly contributions: ContributionProvider<TreeDecorator>,
        @inject(ContributionProvider) @named(NavigatorTreeDecorator) protected readonly navigatorContributions: ContributionProvider<TreeDecorator>) {
        super([...contributions.getContributions(), ...navigatorContributions.getContributions()]);
        this.problemDecorator = this.decorators.find(decorator => decorator.id === 'theia-problem-decorator');
    }

    protected async getColorsFromProblemDecorator(tree: Tree): Promise<Map<string, string>> {
        const colorMap = new Map<string, string>();
        const { problemDecorator } = this;
        if (problemDecorator) {
            const problemDecoratorIterator = (await problemDecorator.decorations(tree)).entries();
            for (const [id, data] of problemDecoratorIterator) {
                const colorFromDecorator = data.fontData?.color;
                if (colorFromDecorator) {
                    colorMap.set(id, colorFromDecorator);
                }
            }
        }
        return colorMap;
    }

    protected addColorToSuffixes(suffixes: TreeDecoration.CaptionAffix[], colorToAdd: string): TreeDecoration.CaptionAffix[] {
        const modifiedCaptionSuffixes = suffixes.map(suffix => {
            const existingFontData = { ...suffix.fontData };
            return { ...suffix, fontData: { ...existingFontData, color: colorToAdd } };
        });
        return modifiedCaptionSuffixes;
    }

    // Theia's problem decorator provides colorization to the FileTree's Caption, but not to its caption suffix.
    // Since the suffix text is coming from elsewhere (OpenEditorsDecoratorService), the color needs to be manually
    // added here
    async getDecorations(tree: Tree): Promise<Map<string, TreeDecoration.Data[]>> {
        const changes = new Map<string, TreeDecoration.Data[]>();
        const colorsFromProblemDecorator = await this.getColorsFromProblemDecorator(tree);

        for (const decorator of this.decorators) {
            for (const [id, data] of (await decorator.decorations(tree)).entries()) {
                const decorationCopy = { ...data };
                const existingColor = colorsFromProblemDecorator.get(id);
                if (existingColor && decorator.id !== 'theia-problem-decorator' && data.captionSuffixes) {
                    const modifiedCaptionSuffixes = this.addColorToSuffixes(data.captionSuffixes, existingColor);
                    decorationCopy.captionSuffixes = modifiedCaptionSuffixes;
                }
                if (changes.has(id)) {
                    changes.get(id)!.push(decorationCopy);
                } else {
                    changes.set(id, [decorationCopy]);
                }
            }
        }
        return changes;
    }
}
