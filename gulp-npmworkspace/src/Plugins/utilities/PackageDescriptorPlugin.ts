import * as gulp from "gulp";
import * as path from "path";
import * as util from "gulp-util";
import * as through from "through2";
import File = require("vinyl");

import {PLUGIN_NAME} from "../../NpmWorkspacePluginOptions";
import {PackageDescriptor} from "../../PackageDescriptor";
import {TransformCallback} from "../StreamFunctionTypes";
import {Logger} from "./Logging";
import {PluginError} from "./PluginError";

/**
 * A function decorator that wraps a supplied function and returns a function that can
 * be used as a Gulp plugin.
 *
 * @param pluginFunc A function that represents the plugin implementation.
 *
 * @returns A function that accepts and returns a stream of 'package.json' files.
 *
 * Plugin function can optionally return a boolean value to indicate whether the current
 * 'package.json' file should continue within the stream. Returning undefined is the same as
 * returning true.
 *
 * When throwing errors, use of [[Error]] will halt the stream. Using [[PluginError]], the plugin
 * function can indicate whether the stream should continue or not.
 */
export function packageDescriptorPlugin(pluginFunc: (packageDescriptor: PackageDescriptor, packagePath: string, ...args: any[]) => void | boolean): (...args: any[]) => NodeJS.ReadWriteStream {
    return function (...args: any[]): NodeJS.ReadWriteStream {
        return through.obj(function (file: File, encoding: string, callback: TransformCallback) {
            debugger;
            if (file.isStream()) return callback(new util.PluginError(PLUGIN_NAME, "Streams are not supported."));

            let pathInfo = path.parse(file.path);

            if (pathInfo.base !== "package.json") return callback(new util.PluginError(PLUGIN_NAME, "Expected a 'package.json' file."));

            let packageDescriptor: PackageDescriptor = JSON.parse(file.contents.toString());

            try {
                let result: void | boolean = pluginFunc(packageDescriptor, pathInfo.dir, ...args);

                if (result === undefined || result === true) {
                    callback(null, file);
                }
                else {
                    callback();
                }
            }
            catch (error) {
                if (error instanceof PluginError) {
                    Logger.error((<PluginError>error).consoleMessage, file);

                    callback((<PluginError>error).options.continue ? null : new util.PluginError(PLUGIN_NAME, error.message, { showProperties: false, showStack: false}),
                             file);
                }
                else {
                    callback(new util.PluginError(PLUGIN_NAME, error.message, { showProperties: false, showStack: false}),
                             file);
                }
            }
        });
    };
}
