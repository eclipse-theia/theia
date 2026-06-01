// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import fs = require('fs');
import path = require('path');
import { PackageJson, parseModule, ReExportJson } from './utility';

export async function readJson<T = unknown>(jsonPath: string): Promise<T> {
    return JSON.parse(await fs.promises.readFile(jsonPath, 'utf8')) as T;
}

export function readJsonSync<T = unknown>(jsonPath: string): T {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as T;
}

export async function readPackageJson(packageName: string, options?: { paths?: string[] }): Promise<[string, PackageJson]> {
    const packageJsonPath = require.resolve(`${packageName}/package.json`, options);
    const packageJson = await readJson<PackageJson>(packageJsonPath);
    return [packageJsonPath, packageJson];
}

export function readPackageJsonSync(packageName: string, options?: { paths?: string[] }): [string, PackageJson] {
    const packageJsonPath = require.resolve(`${packageName}/package.json`, options);
    const packageJson = readJsonSync<PackageJson>(packageJsonPath);
    return [packageJsonPath, packageJson];
}

export async function parsePackageReExports(packageJsonPath: string, packageJson: PackageJson): Promise<[string, ReExport[]]> {
    const packageRoot = path.dirname(packageJsonPath);
    const { theiaReExports } = packageJson;
    if (!theiaReExports) {
        return [packageRoot, []];
    }
    const reExportsByExportDir: ReExport[][] = await Promise.all(Object.entries(theiaReExports).map(
        async ([reExportDir, reExportJson]) => resolveTheiaReExports(packageJsonPath, packageJson, reExportDir, reExportJson))
    );
    return [packageRoot, ([] as ReExport[]).concat(...reExportsByExportDir)];
}

export function parsePackageReExportsSync(packageJsonPath: string, packageJson: PackageJson): [string, ReExport[]] {
    const packageRoot = path.dirname(packageJsonPath);
    const { theiaReExports } = packageJson;
    if (!theiaReExports) {
        return [packageRoot, []];
    }
    const reExportsByExportDir: ReExport[][] = Object.entries(theiaReExports).map(
        ([reExportDir, reExportJson]) => resolveTheiaReExportsSync(packageJsonPath, packageJson, reExportDir, reExportJson)
    );
    return [packageRoot, ([] as ReExport[]).concat(...reExportsByExportDir)];
}

export async function resolveTheiaReExports(
    packageJsonPath: string,
    packageJson: PackageJson,
    reExportDir: string,
    reExportJson: ReExportJson
): Promise<ReExport[]> {
    if (reExportJson.copy) {
        const [packageName, dir] = reExportJson.copy.split('#', 2);
        const [subPackageJsonPath, subPackageJson] = await readPackageJson(packageName, { paths: [path.dirname(packageJsonPath)] });
        if (!subPackageJson.theiaReExports) {
            return [];
        }
        const reExports = await resolveTheiaReExports(subPackageJsonPath, subPackageJson, dir, subPackageJson.theiaReExports[dir]);
        return reExports.map(reExport => {
            reExport.reExportDir = reExportDir;
            reExport.internalImport = reExport.externalImport;
            reExport.externalImport = `${packageJson.name}/${reExportDir}/${reExport.moduleName}`;
            return reExport;
        });
    }
    return buildReExportsFromJson(packageJson, reExportDir, reExportJson);
}

export function resolveTheiaReExportsSync(
    packageJsonPath: string,
    packageJson: PackageJson,
    reExportDir: string,
    reExportJson: ReExportJson
): ReExport[] {
    if (reExportJson.copy) {
        const [packageName, dir] = reExportJson.copy.split('#', 2);
        const [subPackageJsonPath, subPackageJson] = readPackageJsonSync(packageName, { paths: [path.dirname(packageJsonPath)] });
        if (!subPackageJson.theiaReExports) {
            return [];
        }
        const reExports = resolveTheiaReExportsSync(subPackageJsonPath, subPackageJson, dir, subPackageJson.theiaReExports[dir]);
        return reExports.map(reExport => {
            reExport.reExportDir = reExportDir;
            reExport.internalImport = reExport.externalImport;
            reExport.externalImport = `${packageJson.name}/${reExportDir}/${reExport.moduleName}`;
            return reExport;
        });
    }
    return buildReExportsFromJson(packageJson, reExportDir, reExportJson);
}

function buildReExportsFromJson(packageJson: PackageJson, reExportDir: string, reExportJson: ReExportJson): ReExport[] {
    const reExportsStar = reExportJson['export *'] || [];
    const reExportsEqual = reExportJson['export ='] || [];
    return [
        ...reExportsStar.map<ReExportStar>(moduleName => {
            const [packageName, subModuleName] = parseModule(moduleName);
            return {
                moduleName,
                packageName,
                subModuleName,
                reExportStyle: '*',
                reExportDir,
                internalImport: moduleName,
                externalImport: `${packageJson.name}/${reExportDir}/${moduleName}`,
                hostPackageName: packageJson.name,
                versionRange: getPackageVersionRange(packageJson, packageName)
            };
        }),
        ...reExportsEqual.map<ReExportEqual>(pattern => {
            const [moduleName, exportNamespace = moduleName] = pattern.split(' as ', 2);
            if (!/^[a-zA-Z_]\w/.test(exportNamespace)) {
                console.warn(`"${exportNamespace}" is not a valid namespace (module: ${moduleName})`);
            }
            const [packageName, subModuleName] = parseModule(moduleName);
            return {
                moduleName,
                packageName,
                subModuleName,
                exportNamespace,
                reExportStyle: '=',
                reExportDir,
                internalImport: moduleName,
                externalImport: `${packageJson.name}/${reExportDir}/${moduleName}`,
                hostPackageName: packageJson.name,
                versionRange: getPackageVersionRange(packageJson, packageName),
            };
        })
    ];
}

export function getPackageVersionRange(packageJson: PackageJson, packageName: string): string {
    const range = packageJson.dependencies?.[packageName]
        || packageJson.optionalDependencies?.[packageName]
        || packageJson.peerDependencies?.[packageName];
    if (!range) {
        throw new Error(`package not found: ${packageName}`);
    }
    return range;
}

export type ReExport = ReExportStar | ReExportEqual;

export interface ReExportInfo {
    /**
     * The full name of the module. e.g. '@some/dep/nested/file'
     */
    moduleName: string
    /**
     * Name of the package the re-export is from. e.g. '@some/dep' in '@some/dep/nested/file'
     */
    packageName: string
    /**
     * Name of the file within the package. e.g. 'nested/file' in '@some/dep/nested/file'
     */
    subModuleName?: string
    /**
     * Name/path of the directory where the re-exports should be located.
     */
    reExportDir: string
    /**
     * Import statement used internally for the re-export.
     */
    internalImport: string
    /**
     * Import name dependents should use externally for the re-export.
     */
    externalImport: string
    /**
     * Name of the package that depends on the re-export.
     */
    hostPackageName: string
    /**
     * Version range defined by the host package depending on the re-export.
     */
    versionRange: string
}

export interface ReExportStar extends ReExportInfo {
    reExportStyle: '*'
}

export interface ReExportEqual extends ReExportInfo {
    reExportStyle: '='
    /**
     * Pretty name for the re-exported namespace. e.g. 'react-dom' as 'ReactDOM'
     */
    exportNamespace: string
}

export class PackageReExports {

    static async FromPackage(packageName: string): Promise<PackageReExports> {
        const [packageJsonPath, packageJson] = await readPackageJson(packageName);
        const [packageRoot, reExports] = await parsePackageReExports(packageJsonPath, packageJson);
        return new PackageReExports(packageName, packageRoot, reExports);
    }

    static FromPackageSync(packageName: string): PackageReExports {
        // Some tools (e.g. eslint) don't support async operations, so we run the resolution
        // synchronously.
        const [packageJsonPath, packageJson] = readPackageJsonSync(packageName);
        const [packageRoot, reExports] = parsePackageReExportsSync(packageJsonPath, packageJson);
        return new PackageReExports(packageName, packageRoot, reExports);
    }

    constructor(
        readonly packageName: string,
        readonly packageRoot: string,
        readonly all: readonly Readonly<ReExport>[]
    ) { }

    findReExportByModuleName(moduleName: string): ReExport | undefined {
        return this.all.find(reExport => reExport.moduleName === moduleName);
    }

    findReExportsByPackageName(packageName: string): ReExport[] {
        return this.all.filter(reExport => reExport.packageName === packageName);
    }

    resolvePath(...parts: string[]): string {
        return path.resolve(this.packageRoot, ...parts);
    }
}
