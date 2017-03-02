"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var inversify_1 = require("inversify");
/**
 * Plugin registry
 */
var PluginRegistry = (function () {
    function PluginRegistry(plugins) {
        this.plugins = plugins;
    }
    PluginRegistry.prototype.createContainer = function () {
        var container = new inversify_1.Container();
        for (var _i = 0, _a = this.plugins; _i < _a.length; _i++) {
            var plugin = _a[_i];
            container.load(plugin.getContainerModule());
        }
        return container;
    };
    return PluginRegistry;
}());
exports.PluginRegistry = PluginRegistry;
