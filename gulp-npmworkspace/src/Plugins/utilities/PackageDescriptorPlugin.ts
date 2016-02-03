import * as gulp from "gulp";
import * as path from "path";
import * as util from "gulp-util";
import * as through from "through2";
import {Promise} from "es6-promise";
import File = require("vinyl");

import {PLUGIN_NAME, NpmWorkspacePluginOptions} from "../../NpmWorkspacePluginOptions";
import {PackageDescriptor} from "../../PackageDescriptor";
import {TransformCallback} from "../StreamFunctionTypes";
import {Logger} from "./Logging";
import {PluginError} from "./PluginError";

/**
 * Represents a package that has been visited by a Gulp plugin implementation.
 */
export interface Package {
    packageDescriptor: PackageDescriptor;

    packagePath: string;
}

/**
 * A function that represents a Gulp plugin implementation.
 *
 * @param packageDescriptor The package descriptor representing the 'package.json' file.
 * @param packagePath The path to the package.
 * @param file The Gulp file being processed.
 * @param packageMap A dictionary of packages that have been processed by the Gulp plugin.
 */
export type PluginFunction = (packageDescriptor: PackageDescriptor, packagePath: string, file: File, packageMap: IDictionary<Package>, ...args: any[]) => void | boolean | Promise<void | boolean>;

/**
 * A fuction that creates a binding for executing [[PluginFunction]] functions. Objects returned
 * by [[PluginFunctionBindingFunction]] are used as 'this' when executing the associated
 * [[PluginFunction]] function.
 */
export type PluginFunctionBindingFunction = (...args: any[]) => any;

/**
 * A function decorator that wraps a supplied function with a function that can
 * be used as a Gulp plugin.
 *
 * @param pluginFunc A function that represents the plugin implementation.
 * @param pluginFuncBindingFunc An optional function that creates a binding for executing the
 * supplied plugin function. The object returned from this function will be used as 'this' when
 * executing the plugin function.
 *
 * @returns A function that accepts and returns a stream of 'package.json' files.
 *
 * pluginFunc can optionally return a boolean value to indicate whether the current
 * 'package.json' file should continue within the stream. Returning undefined is the same as
 * returning true. pluginFunc can also return these values as a Promise which then enforces
 * asynchronous semantics by waiting for the returned promise to yield a value.
 *
 * When throwing errors, use of [[Error]] will halt the stream. Using [[PluginError]], the plugin
 * function can indicate whether the stream should continue or not.
 */
export function packageDescriptorPlugin(pluginFunc: PluginFunction, pluginFuncBindingFunc?: PluginFunctionBindingFunction): (...args: any[]) => NodeJS.ReadWriteStream {
    return function (...args: any[]): NodeJS.ReadWriteStream {
        let pluginBinding = pluginFuncBindingFunc ? pluginFuncBindingFunc(...args) : undefined;
        let packageMap: IDictionary<Package> = { };

        return through.obj(function (file: File, encoding: string, callback: TransformCallback) {
            if (file.isStream()) return callback(new util.PluginError(PLUGIN_NAME, "Streams are not supported."));

            let pathInfo = path.parse(file.path);

            if (pathInfo.base !== "package.json") return callback(new util.PluginError(PLUGIN_NAME, "Expected a 'package.json' file."));

            let packageDescriptor: PackageDescriptor = JSON.parse(file.contents.toString());

            packageMap[packageDescriptor.name] = {
                packageDescriptor: packageDescriptor,
                packagePath: pathInfo.dir
            }

            let options: NpmWorkspacePluginOptions = file["workspaceOptions"];

            if (options.package && (options.onlyNamedPackage && options.package !== packageDescriptor.name)) {
                return callback(null, file);
            }

            try {
                let result: any = pluginFunc.apply(pluginBinding, [ packageDescriptor, pathInfo.dir, file, packageMap ].concat(args))

                if (result instanceof Promise) {
                    (<Promise<void | boolean>>result).then((promiseResult: void | boolean) => {
                        if (promiseResult === undefined || promiseResult === true) {
                            callback(null, file);
                        }
                        else {
                            callback();
                        }
                    })
                    .catch((error) => {
                        handleError(error, file, callback);
                    });
                }
                else {
                    if (result === undefined || result === true) {
                        callback(null, file);
                    }
                    else {
                        callback();
                    }
                }
            }
            catch (error) {
                handleError(error, file, callback);
            }
        });
    };
}

function handleError(error: any, file: File, callback: TransformCallback): void {
    if (error instanceof PluginError) {
        Logger.error((<PluginError>error).consoleMessage, file);

        callback((<PluginError>error).options.continue ? null : new util.PluginError(PLUGIN_NAME, error.message, { showProperties: false, showStack: false}), file);
    }
    else {
        callback(new util.PluginError(PLUGIN_NAME, error.message, { showProperties: false, showStack: false}), file);
    }
}
