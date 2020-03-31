/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable } from 'inversify';
import { MarkerManager } from '../marker-manager';
import { PROBLEM_KIND } from '../../common/problem-marker';
import { Diagnostic } from 'vscode-languageserver-types';
import URI from '@theia/core/lib/common/uri';

export interface ProblemStat {
    errors: number;
    warnings: number;
    infos: number;
}

@injectable()
export class ProblemManager extends MarkerManager<Diagnostic> {

    public getKind(): string {
        return PROBLEM_KIND;
    }

    /**
     * Get the problem stat (number of `errors`, `warnings`, and `infos`).
     * - If `uri` is provided, determine the total count for this resource.
     * @param uri the marker URI for search purposes.
     *
     * @returns the `ProblemStat`.
     */
    getProblemStat(uri?: URI): ProblemStat {
        let errors = 0;
        let warnings = 0;
        let infos = 0;
        for (const marker of this.findMarkers({ uri })) {
            if (marker.data.severity === 1) {
                errors++;
            } else if (marker.data.severity === 2) {
                warnings++;
            } else if (marker.data.severity === 3) {
                infos++;
            }
        }
        return { errors, warnings, infos };
    }

}
