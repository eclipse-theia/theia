// *****************************************************************************
// Copyright (C) 2015-2018 Red Hat, Inc.
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

import { injectable } from '@theia/core/shared/inversify';
import { PluginPackageGrammarsContribution, GrammarsContribution } from '../../../common';
import { readGrammarFromDisk } from '@theia/plugin-utils/lib/read-grammars';

@injectable()
export class GrammarsReader {

    async readGrammars(rawGrammars: PluginPackageGrammarsContribution[], pluginPath: string): Promise<GrammarsContribution[]> {
        const result = new Array<GrammarsContribution>();
        for (const rawGrammar of rawGrammars) {
            const grammar = await this.readGrammar(rawGrammar, pluginPath);
            if (grammar) {
                result.push(grammar);
            }
        }

        return result;
    }

    private async readGrammar(rawGrammar: PluginPackageGrammarsContribution, pluginPath: string): Promise<GrammarsContribution | undefined> {
        return readGrammarFromDisk(rawGrammar, pluginPath);
    }
}
