
import * as gulp from "gulp";
import * as util from "gulp-util";
import * as path from "path";
import * as fs from "fs";
import * as _ from "underscore";
import * as through from "through2";
import File = require("vinyl");

import {getPackageName, pluginName} from "../utilities/CommandLine";
import {TransformAction, TransformCallback, FlushAction, FlushCallback} from "./StreamFunctionTypes";
import {PackageDependencyContext} from "./utilities/PackageDependencyContext";

const LOCAL_GULP_WORKSPACE_FILENAME: string = "gulpfile.workspace.js";

/**
 * A Gulp plugin that returns a stream of 'package.json' files that have been found in the current
 * workspace. The files are streamed in dependency order.
 *
 * @param options An optional hash of options that can be passed through to gulp.src(). The 'read'
 * property is automatically set to 'true'.
 *
 * @returns A stream that contains the 'package.json' files found in the current workspace.
 */
export function workspacePackages(options?: gulp.SrcOptions): NodeJS.ReadWriteStream {
    options = _.extend(options || { }, { read: true });

    let context = new PackageDependencyContext();

    return gulp.src([ "./package.json", "./*/package.json" ], options)
        .pipe(through.obj(collectPackages(context), streamPackages(context)));
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
            return callback(new util.PluginError(pluginName, "Streams are not supported."));
        }

        let packageDescriptor: PackageDescriptor = JSON.parse(file.contents.toString());

        if (packageDescriptor.isWorkspace) {
            return callback(); // Ignore package.json files marked as 'isWorkspace'
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
function streamPackages(context: PackageDependencyContext): FlushAction {
    return function (callback: FlushCallback) {
        try {
            context.writeToStream(this, (file: File) => {
                let workspaceFilePath = path.join(path.parse(file.path).dir, LOCAL_GULP_WORKSPACE_FILENAME);

                // Add a getWorkspace() function the streamed file that returns the 'gulp.workspace.js' file
                // that may be present in the workspace package folder.
                file["getWorkspace"] = function() {
                    return fs.existsSync(workspaceFilePath) ? require(workspaceFilePath) : { };
                };

                return file;
            });

            callback();
        }
        catch (error) {
            callback(error);
        }
    };
}
