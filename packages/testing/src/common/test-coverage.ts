// *****************************************************************************
// Copyright (C) 2023 Mathieu Bussieres and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// Based on https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/contrib/testing/common/testCoverage.ts

/* eslint-disable import/no-extraneous-dependencies */

import { CancellationToken } from '@theia/monaco-editor-core/esm/vs/base/common/cancellation';
import { URI } from '@theia/monaco-editor-core/esm/vs/base/common/uri';
import { IFileCoverage, CoverageDetails, ICoveredCount } from './test-types';

export interface ICoverageAccessor {
    provideFileCoverage: (token: CancellationToken) => Promise<IFileCoverage[]>;
    resolveFileCoverage: (fileIndex: number, token: CancellationToken) => Promise<CoverageDetails[]>;
}

/**
 * Class that exposese coverage information for a run.
 */
export class TestCoverage {
    private fileCoverage?: Promise<IFileCoverage[]>;

    constructor(private readonly accessor: ICoverageAccessor) { }

    /**
     * Gets coverage information for all files.
     */
    public async getAllFiles(token = CancellationToken.None): Promise<IFileCoverage[]> {
        if (!this.fileCoverage) {
            this.fileCoverage = this.accessor.provideFileCoverage(token);
        }

        try {
            return await this.fileCoverage;
        } catch (e) {
            this.fileCoverage = undefined;
            throw e;
        }
    }

    /**
     * Gets coverage information for a specific file.
     */
    public async getUri(uri: URI, token = CancellationToken.None): Promise<IFileCoverage | undefined> {
        const files = await this.getAllFiles(token);
        if (!files) {
            return undefined;
        }
        return files.find(f => f.uri.toString() === uri.toString());
    }
}

export class FileCoverage {
    private _details?: CoverageDetails[] | Promise<CoverageDetails[]>;
    public readonly uri: URI;
    public readonly statement: ICoveredCount;
    public readonly branch?: ICoveredCount;
    public readonly function?: ICoveredCount;

    /** Gets the total coverage percent based on information provided. */
    public get tpc(): number {
        let numerator = this.statement.covered;
        let denominator = this.statement.total;

        if (this.branch) {
            numerator += this.branch.covered;
            denominator += this.branch.total;
        }

        if (this.function) {
            numerator += this.function.covered;
            denominator += this.function.total;
        }

        return denominator === 0 ? 1 : numerator / denominator;
    }

    constructor(coverage: IFileCoverage, private readonly index: number, private readonly accessor: ICoverageAccessor) {
        this.uri = URI.revive(coverage.uri);
        this.statement = coverage.statement;
        this.branch = coverage.branch;
        this.function = coverage.branch;
        this._details = coverage.details;
    }

    /**
     * Gets per-line coverage details.
     */
    public async details(token = CancellationToken.None): Promise<CoverageDetails[]> {
        if (!this._details) {
            this._details = this.accessor.resolveFileCoverage(this.index, token);
        }

        try {
            return await this._details;
        } catch (e) {
            this._details = undefined;
            throw e;
        }
    }
}
