import * as gulp from "gulp";
import * as util from "gulp-util";
import * as path from "path";
import * as fs from "fs";
import * as _ from "underscore";
import * as through from "through2";
import File = require("vinyl");

import {PLUGIN_NAME, NpmWorkspacePluginOptions, getWorkspacePluginOptions} from "../NpmWorkspacePluginOptions";
import {TransformAction, TransformCallback, FlushAction, FlushCallback} from "./StreamFunctionTypes";
import {PackageDependencyContext} from "./utilities/PackageDependencyContext";
import {Logger} from "./utilities/Logging";
import {PackageDescriptor} from "../PackageDescriptor";

const LOCAL_GULP_WORKSPACE_FILENAME: string = "gulpfile.workspace.js";

/**
 * Options for workspacePackages().
 */
export interface WorkspacePackagesOptions {
    /**
     * An array of additional paths to include when looking for workspace packages.
     */
    additionalPaths?: Array<string>;
}

/**
 * A Gulp plugin that returns a stream of 'package.json' files that have been found in the current
 * workspace. The files are streamed in dependency order.
 *
 * @param options An optional hash of options that can be passed through to gulp.src(). The 'read'
 * property is automatically set to 'true'.
 *
 * @returns A stream that contains the 'package.json' files found in the current workspace.
 */
export function workspacePackages(options?: gulp.SrcOptions & NpmWorkspacePluginOptions & WorkspacePackagesOptions): NodeJS.ReadWriteStream {
    options = _.extend(getWorkspacePluginOptions(options), options, { read: true });

    let context = new PackageDependencyContext();

    let packageSourcePaths = [ "./package.json", "./*/package.json" ];

    if (options.additionalPaths) {
       packageSourcePaths = _.union(packageSourcePaths, options.additionalPaths.map((p) => path.join(p, "*/package.json")))
    }

    return gulp.src(packageSourcePaths, options)
        .pipe(through.obj(collectPackages(context), streamPackages(context, options)));
}

/**
 * Returns a [[TransformAction]] that pushes 'package.json' files into a [[PackageDependencyContext]] object.
 *
 * @param context The [[PackageDependencyContext]] to use when collecting the 'package.json' files.
 *
 * @returns A [[TransformAction]] function.
 *
 * [[collectPackages]] does not write the received 'package.json' files into the output stream. Instead
 * it simply gathers them into the supplied [[PackageDependencyContext]] object. [[streamPackages]] can be used as
 * a flush function to output the received 'package.json' files in dependency order once all the files
 * have been received.
 */
function collectPackages(context: PackageDependencyContext): TransformAction {
    return function (file: File, encoding, callback: TransformCallback) {
        if (file.isStream()) {
            return callback(new util.PluginError(PLUGIN_NAME, "Streams are not supported."));
        }

        let packageDescriptor: PackageDescriptor = JSON.parse(file.contents.toString());

        if (packageDescriptor.workspace) {
            return callback(); // Ignore package.json files marked as being workspaces
        }

        context.addPackage(packageDescriptor, file);

        let packageDependencies: IDictionary<string>
            = _.extend({ }, packageDescriptor.dependencies, packageDescriptor.devDependencies, packageDescriptor.optionalDependencies);

        for (let packageName in packageDependencies) {
            context.addPackageDependency(packageDescriptor, packageName);
        }

        callback();
    };
}

/**
 * Returns a [[FlushAction]] that streams the 'package.json' files from a given [[PackageDependencyContext]].
 *
 * @param context The [[PackageDependencyContext]] from which to stream 'package.json' files.
 *
 * @returns A [[FlushAction]] function.
 *
 * The supplied [[PackageDependencyContext]] object will stream the 'package.json' files in dependency order.
 */
function streamPackages(context: PackageDependencyContext, options: NpmWorkspacePluginOptions): FlushAction {
    return function (callback: FlushCallback) {
        try {
            context.writeToStream(this, options.package, (file: File) => {
                let workspaceFilePath = path.join(path.parse(file.path).dir, LOCAL_GULP_WORKSPACE_FILENAME);

                // Add a getWorkspace() function the streamed file that returns the 'gulp.workspace.js' file
                // that may be present in the workspace package folder.
                file["getWorkspace"] = function() {
                    return fs.existsSync(workspaceFilePath) ? require(workspaceFilePath) : { };
                };

                file["workspaceOptions"] = options;

                return file;
            });

            callback();
        }
        catch (error) {
            if (error instanceof util.PluginError) {
                if (options.enableLogging) {
                    Logger.error(util.colors.red(`Unexpected error: ${error.message}`));
                }

                return callback(error);
            }

            if (options.enableLogging) {
                let packageNameRegExp = /(?:\:|->)\s((?:\w|-)*)\s?/g;

                let findPackageNames = () => {
                    let match = packageNameRegExp.exec(error.message);

                    return match ? util.colors.red(`'${util.colors.cyan(match[1])}' -> ${findPackageNames()}`)
                                : util.colors.red("...");
                };

                Logger.error(util.colors.red(`Circular dependency found in Workspace: ${findPackageNames()}`));
            }

            callback(new util.PluginError(PLUGIN_NAME, "Circular dependency found.", { showProperties: false, showStack: false}));
        }
    };
}
