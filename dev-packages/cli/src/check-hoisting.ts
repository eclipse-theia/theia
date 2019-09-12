/********************************************************************************
 * Copyright (c) 2018-2019 TypeFox and others
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

import * as fs from 'fs';
import * as path from 'path';

/**
 * This script makes sure all the dependencies are hoisted into the root `node_modules` after running `yarn`.
 *  - https://github.com/eclipse-theia/theia/pull/2994#issuecomment-425447650
 *  - https://github.com/eclipse-theia/theia/pull/2994#issuecomment-425649817
 *
 * If you do not want to bail the execution: `theia check:hoisted -s`
 */

type DiagnosticType = 'error' | 'warn';

interface Diagnostic {
    severity: number,
    message: string,
}

type DiagnosticMap = Map<string, Diagnostic[]>;

/**
 * Folders to skip inside the `node_modules` when checking the hoisted dependencies. Such as the `.bin` and `.cache` folders.
 */
const toSkip = ['.bin', '.cache'];

function collectIssues(): DiagnosticMap {
    console.log('🔍  Analyzing hoisted dependencies in the Theia extensions...');
    const root = process.cwd();
    const rootNodeModules = path.join(root, 'node_modules');
    const packages = path.join(root, 'packages');

    const issues = new Map<string, Diagnostic[]>();
    for (const extension of fs.readdirSync(packages)) {
        const extensionPath = path.join(packages, extension);
        const nodeModulesPath = path.join(extensionPath, 'node_modules');
        if (fs.existsSync(nodeModulesPath)) {
            for (const dependency of fs.readdirSync(nodeModulesPath).filter(name => toSkip.indexOf(name) === -1)) {
                const dependencyPath = path.join(nodeModulesPath, dependency);
                const version = versionOf(dependencyPath);
                let message = `Dependency '${dependency}' ${version ? `[${version}] ` : ''}was not hoisted to the root 'node_modules' folder.`;
                const existingDependency = path.join(rootNodeModules, dependency);
                if (fs.existsSync(existingDependency)) {
                    const otherVersion = versionOf(existingDependency);
                    if (otherVersion) {
                        message += ` The same dependency already exists with version ${otherVersion} at '${existingDependency}'.`;
                    }
                }
                error(issues, extension, message);
            }
        } else {
            warn(issues, extension, "Does not have 'node_modules' folder.");
        }
    }
    return issues;
}

function versionOf(npmPackagePath: string): string {
    const packageJsonPath = path.join(npmPackagePath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        return require(packageJsonPath).version || '';
    }
    return '';
}

function warn(issues: DiagnosticMap, extension: string, message: string): void {
    log(issues, extension, message, 'warn');
}

function error(issues: DiagnosticMap, extension: string, message: string): void {
    log(issues, extension, message, 'error');
}

function log(issues: DiagnosticMap, extension: string, message: string, type: DiagnosticType): void {
    const key = `@theia/${extension}`;
    if (!issues.has(key)) {
        issues.set(key, []);
    }
    const severity = toSeverity(type);
    issues.get(key)!.push({ severity, message });
}

function toSeverity(type: DiagnosticType): number {
    switch (type) {
        case 'error': return 0;
        case 'warn': return 1;
        default: throw new Error(`Unexpected type: ${type}.`);
    }
}

function toType(severity: number): DiagnosticType {
    switch (severity) {
        case 0: return 'error';
        case 1: return 'warn';
        default: throw new Error(`Unexpected severity: ${severity}.`);
    }
}

export default function assert({ suppress }: { suppress: boolean }): void {
    const issues = collectIssues();
    console.log('📖  Summary:');
    let code = 0;
    if (issues.size > 0) {
        for (const [extension, issuesPerExtension] of issues.entries()) {
            issuesPerExtension.sort((left, right) => left.severity - right.severity);
            if (issuesPerExtension) {
                console.log(`The following dependency issues were detected in '${extension}':`);
                for (const { severity, message } of issuesPerExtension) {
                    const type = toType(severity);
                    console.log(` - ${type}: ${message}`);
                    if (type === 'error') {
                        code = 1;
                    }
                }
            }
        }
    } else {
        console.log('🎉  No dependency issues were detected.');
    }
    if (code !== 0 && suppress) {
        console.log('⚠️  This is a reminder to fix the dependency issues.');
        process.exit(0);
    }
    process.exit(code);
}
