"use strict";
// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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
var fs = require("fs-extra");
var path = require("path");
var application_package_1 = require("@theia/application-package/lib/application-package");
var modulePackages = [];
for (var _i = 0, _a = new application_package_1.ApplicationPackage({ projectPath: process.cwd() }).extensionPackages; _i < _a.length; _i++) {
    var extensionPackage = _a[_i];
    modulePackages.push({
        name: extensionPackage.name,
        dir: path.dirname(extensionPackage.raw.installed.packagePath)
    });
}
function exposeModule(modulePackage, resourcePath, source) {
    if (!modulePackage.name) {
        return source;
    }
    var _a = path.parse(resourcePath), dir = _a.dir, name = _a.name;
    var moduleName = path.join(modulePackage.name, dir.substring(modulePackage.dir.length));
    if (name !== 'index') {
        moduleName = path.join(moduleName, name);
    }
    if (path.sep !== '/') {
        moduleName = moduleName.split(path.sep).join('/');
    }
    // Use `module.exports` with a fallback to `this` for compatibility with ESM modules.
    // Webpack wraps ESM modules in arrow functions where `this` is `undefined`,
    // but `module.exports` is available and points to the webpack exports object.
    return source + "\n;(globalThis['theia'] = globalThis['theia'] || {})['".concat(moduleName, "'] = (typeof module === 'object' && module.exports) || this;\n");
}
module.exports = function (source, sourceMap) {
    var _this = this;
    if (this.cacheable) {
        this.cacheable();
    }
    var modulePackage = modulePackages.find(function (_a) {
        var dir = _a.dir;
        return _this.resourcePath.startsWith(dir + path.sep);
    });
    if (modulePackage) {
        this.callback(undefined, exposeModule(modulePackage, this.resourcePath, source), sourceMap);
        return;
    }
    var searchString = path.sep + 'node_modules';
    var index = this.resourcePath.lastIndexOf(searchString);
    if (index !== -1) {
        var nodeModulesPath = this.resourcePath.substring(0, index + searchString.length);
        var dir = this.resourcePath;
        while ((dir = path.dirname(dir)) !== nodeModulesPath) {
            try {
                var name_1 = fs.readJSONSync(path.join(dir, 'package.json')).name;
                modulePackage = { name: name_1, dir: dir };
                modulePackages.push(modulePackage);
                this.callback(undefined, exposeModule(modulePackage, this.resourcePath, source), sourceMap);
                return;
            }
            catch (_a) {
                /** no-op */
            }
        }
    }
    this.callback(undefined, source, sourceMap);
};
