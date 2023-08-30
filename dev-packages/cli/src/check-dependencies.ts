// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { create as logUpdater } from 'log-update';
import * as chalk from 'chalk';

const NODE_MODULES = 'node_modules';
const PACKAGE_JSON = 'package.json';

const logUpdate = logUpdater(process.stdout);

interface CheckDependenciesOptions {
    workspaces: string[] | undefined,
    include: string[],
    exclude: string[],
    skipHoisted: boolean,
    skipUniqueness: boolean,
    skipSingleTheiaVersion: boolean,
    onlyTheiaExtensions: boolean,
    suppress: boolean
}

/** NPM package */
interface Package {
    /** Name of the package, e.g. `@theia/core`. */
    name: string,
    /** Actual resolved version of the package, e.g. `1.27.0`. */
    version: string,
    /** Path of the package relative to the workspace, e.g. `node_modules/@theia/core`. */
    path: string,
    /** Whether the package is hoisted or not, i.e., whether it is contained in the root `node_modules`. */
    hoisted: boolean,
    /** Workspace location in which the package was found. */
    dependent: string | undefined,
    /** Whether the package is a Theia extension or not */
    isTheiaExtension?: boolean,
}

/** Issue found with a specific package. */
interface DependencyIssue {
    /** Type of the issue. */
    issueType: 'not-hoisted' | 'multiple-versions' | 'theia-version-mix',
    /** Package with issue. */
    package: Package,
    /** Packages related to this issue. */
    relatedPackages: Package[],
    /** Severity */
    severity: 'warning' | 'error'
}

export default function checkDependencies(options: CheckDependenciesOptions): void {
    const workspaces = deriveWorkspaces(options);
    logUpdate(`✅ Found ${workspaces.length} workspaces`);

    console.log('🔍 Collecting dependencies...');
    const dependencies = findAllDependencies(workspaces, options);
    logUpdate(`✅ Found ${dependencies.length} dependencies`);

    console.log('🔍 Analyzing dependencies...');
    const issues = analyzeDependencies(dependencies, options);
    if (issues.length <= 0) {
        logUpdate('✅ No issues were found');
        process.exit(0);
    }

    logUpdate('🟠 Found ' + issues.length + ' issues');
    printIssues(issues);
    printHints(issues);
    process.exit(options.suppress ? 0 : 1);
}

function deriveWorkspaces(options: CheckDependenciesOptions): string[] {
    const wsGlobs = options.workspaces ?? readWorkspaceGlobsFromPackageJson();
    const workspaces: string[] = [];
    for (const wsGlob of wsGlobs) {
        workspaces.push(...glob.sync(wsGlob + '/'));
    }
    return workspaces;
}

function readWorkspaceGlobsFromPackageJson(): string[] {
    const rootPackageJson = path.join(process.cwd(), PACKAGE_JSON);
    if (!fs.existsSync(rootPackageJson)) {
        console.error('Directory does not contain a package.json with defined workspaces');
        console.info('Run in the root of a Theia project or specify them via --workspaces');
        process.exit(1);
    }
    return require(rootPackageJson).workspaces ?? [];
}

function findAllDependencies(workspaces: string[], options: CheckDependenciesOptions): Package[] {
    const dependencies: Package[] = [];
    dependencies.push(...findDependencies('.', options));
    for (const workspace of workspaces) {
        dependencies.push(...findDependencies(workspace, options));
    }
    return dependencies;
}

function findDependencies(workspace: string, options: CheckDependenciesOptions): Package[] {
    const dependent = getPackageName(path.join(process.cwd(), workspace, PACKAGE_JSON));
    const nodeModulesDir = path.join(workspace, NODE_MODULES);
    const matchingPackageJsons: Package[] = [];
    options.include.forEach(include =>
        glob.sync(`${include}/${PACKAGE_JSON}`, {
            cwd: nodeModulesDir,
            ignore: [
                `**/${NODE_MODULES}/**`, // node_modules folders within dependencies
                `[^@]*/*/**/${PACKAGE_JSON}`, // package.json that isn't at the package root (and not in an @org)
                `@*/*/*/**/${PACKAGE_JSON}`, // package.json that isn't at the package root (and in an @org)
                ...options.exclude] // user-specified exclude patterns
        }).forEach(packageJsonPath => {
            const dependency = toDependency(packageJsonPath, nodeModulesDir, dependent);
            if (!options.onlyTheiaExtensions || dependency.isTheiaExtension) {
                matchingPackageJsons.push(dependency);
            }
            const childNodeModules: string = path.join(nodeModulesDir, packageJsonPath, '..');
            matchingPackageJsons.push(...findDependencies(childNodeModules, options));
        })
    );
    return matchingPackageJsons;
}

function toDependency(packageJsonPath: string, nodeModulesDir: string, dependent?: string): Package {
    const fullPackageJsonPath = path.join(process.cwd(), nodeModulesDir, packageJsonPath);
    const name = getPackageName(fullPackageJsonPath);
    const version = getPackageVersion(fullPackageJsonPath);
    return {
        name: name ?? packageJsonPath.replace('/' + PACKAGE_JSON, ''),
        version: version ?? 'unknown',
        path: path.relative(process.cwd(), fullPackageJsonPath),
        hoisted: nodeModulesDir === NODE_MODULES,
        dependent: dependent,
        isTheiaExtension: isTheiaExtension(fullPackageJsonPath)
    };
}

function getPackageVersion(fullPackageJsonPath: string): string | undefined {
    try {
        return require(fullPackageJsonPath).version;
    } catch (error) {
        return undefined;
    }
}

function getPackageName(fullPackageJsonPath: string): string | undefined {
    try {
        return require(fullPackageJsonPath).name;
    } catch (error) {
        return undefined;
    }
}

function isTheiaExtension(fullPackageJsonPath: string): boolean {
    try {
        const theiaExtension = require(fullPackageJsonPath).theiaExtensions;
        return theiaExtension ? true : false;
    } catch (error) {
        return false;
    }
}

function analyzeDependencies(packages: Package[], options: CheckDependenciesOptions): DependencyIssue[] {
    const issues: DependencyIssue[] = [];
    if (!options.skipHoisted) {
        issues.push(...findNotHoistedDependencies(packages, options));
    }
    if (!options.skipUniqueness) {
        issues.push(...findDuplicateDependencies(packages, options));
    }
    if (!options.skipSingleTheiaVersion) {
        issues.push(...findTheiaVersionMix(packages, options));
    }
    return issues;
}

function findNotHoistedDependencies(packages: Package[], options: CheckDependenciesOptions): DependencyIssue[] {
    const issues: DependencyIssue[] = [];
    const nonHoistedPackages = packages.filter(p => p.hoisted === false);
    for (const nonHoistedPackage of nonHoistedPackages) {
        issues.push(createNonHoistedPackageIssue(nonHoistedPackage, options));
    }
    return issues;
}

function createNonHoistedPackageIssue(nonHoistedPackage: Package, options: CheckDependenciesOptions): DependencyIssue {
    return {
        issueType: 'not-hoisted',
        package: nonHoistedPackage,
        relatedPackages: [getHoistedPackageByName(nonHoistedPackage.name)],
        severity: options.suppress ? 'warning' : 'error'
    };
}

function getHoistedPackageByName(name: string): Package {
    return toDependency(path.join(name, PACKAGE_JSON), NODE_MODULES);
}

function findDuplicateDependencies(packages: Package[], options: CheckDependenciesOptions): DependencyIssue[] {
    const duplicates: string[] = [];
    const packagesGroupedByName = new Map<string, Package[]>();
    for (const currentPackage of packages) {
        const name = currentPackage.name;
        if (!packagesGroupedByName.has(name)) {
            packagesGroupedByName.set(name, []);
        }
        const currentPackages = packagesGroupedByName.get(name)!;
        currentPackages.push(currentPackage);
        if (currentPackages.length > 1 && duplicates.indexOf(name) === -1) {
            duplicates.push(name);
        }
    }

    duplicates.sort();
    const issues: DependencyIssue[] = [];
    for (const duplicate of duplicates) {
        const duplicatePackages = packagesGroupedByName.get(duplicate);
        if (duplicatePackages && duplicatePackages.length > 0) {
            issues.push({
                issueType: 'multiple-versions',
                package: duplicatePackages.pop()!,
                relatedPackages: duplicatePackages,
                severity: options.suppress ? 'warning' : 'error'
            });
        }
    }

    return issues;
}

function findTheiaVersionMix(packages: Package[], options: CheckDependenciesOptions): DependencyIssue[] {
    // @theia/monaco-editor-core is following the versions of Monaco so it can't be part of this check
    const theiaPackages = packages.filter(p => p.name.startsWith('@theia/') && !p.name.startsWith('@theia/monaco-editor-core'));
    let theiaVersion = undefined;
    let referenceTheiaPackage = undefined;
    const packagesWithOtherVersion: Package[] = [];
    for (const theiaPackage of theiaPackages) {
        if (!theiaVersion && theiaPackage.version) {
            theiaVersion = theiaPackage.version;
            referenceTheiaPackage = theiaPackage;
        } else if (theiaVersion !== theiaPackage.version) {
            packagesWithOtherVersion.push(theiaPackage);
        }
    }

    if (referenceTheiaPackage && packagesWithOtherVersion.length > 0) {
        return [{
            issueType: 'theia-version-mix',
            package: referenceTheiaPackage,
            relatedPackages: packagesWithOtherVersion,
            severity: 'error'
        }];
    }
    return [];
}

function printIssues(issues: DependencyIssue[]): void {
    console.log();
    const indent = issues.length.toString().length;
    issues.forEach((issue, index) => {
        printIssue(issue, index + 1, indent);
    });
}

function printIssue(issue: DependencyIssue, issueNumber: number, indent: number): void {
    const remainingIndent = indent - issueNumber.toString().length;
    const indentString = ' '.repeat(remainingIndent + 1);
    console.log(issueTitle(issue, issueNumber, indentString));
    console.log(issueDetails(issue, '   ' + ' '.repeat(indent)));
    console.log();
}

function issueTitle(issue: DependencyIssue, issueNumber: number, indent: string): string {
    const dependent = issue.package.dependent ? ` in ${chalk.blueBright(issue.package.dependent ?? 'unknown')}` : '';
    return chalk.bgWhiteBright.bold.black(`#${issueNumber}${indent}`) + ' ' + chalk.cyanBright(issue.package.name)
        + dependent + chalk.dim(` [${issue.issueType}]`);
}

function issueDetails(issue: DependencyIssue, indent: string): string {
    return indent + severity(issue) + ' ' + issueMessage(issue) + '\n'
        + indent + versionLine(issue.package) + '\n'
        + issue.relatedPackages.map(p => indent + versionLine(p)).join('\n');
}

function issueMessage(issue: DependencyIssue): string {
    if (issue.issueType === 'multiple-versions') {
        return `Multiple versions of dependency ${chalk.bold(issue.package.name)} found.`;
    } else if (issue.issueType === 'theia-version-mix') {
        return `Mix of ${chalk.bold('@theia/*')} versions found.`;
    } else {
        return `Dependency ${chalk.bold(issue.package.name)} is not hoisted.`;
    }
}

function severity(issue: DependencyIssue): string {
    return issue.severity === 'error' ? chalk.red('error') : chalk.yellow('warning');
}

function versionLine(pckg: Package): string {
    return chalk.bold(pckg.version) + ' in ' + pckg.path;
}

function printHints(issues: DependencyIssue[]): void {
    console.log();
    if (issues.find(i => i.issueType === 'theia-version-mix')) {
        console.log('⛔ A mix of Theia versions is very likely leading to a broken application.');
    }
    console.log(`ℹ️  Use ${chalk.bold('yarn why <package-name>')} to find out why those multiple versions of a package are pulled.`);
    console.log('ℹ️  Try to resolve those issues by finding package versions along the dependency chain that depend on compatible versions.');
    console.log(`ℹ️  Use ${chalk.bold('resolutions')} in your root package.json to force specific versions as a last resort.`);
    console.log();
}
