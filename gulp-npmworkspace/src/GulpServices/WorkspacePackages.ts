import {DepGraph} from "dependency-graph";
import {getPackageName, pluginName} from "../utilities/CommandLine";

import * as gulp from "gulp";
import * as util from "gulp-util";
import * as path from "path";
import * as fs from "fs";
import * as _ from "underscore";
import * as through from "through2";

import File = require("vinyl");


const LOCAL_GULP_WORKSPACE_FILENAME: string = "gulpfile.workspace.js";


type TransformAction = (file: File, encoding: string, callback: Function) => void;
type CompleteAction = (callback: () => void) => void;


/**
 * A private class that provides context for the collection of workspace packages.
 */
class CollectContext {
    private _packageGraph: DepGraph = new DepGraph();
    private _packageMap: IDictionary<File> = { };

    /**
     * Adds a package.
     *
     * @param packageDescriptor The package descriptor of the package to add.
     * @param file The 'Gulp' file that represents the package descriptor.
     */
    public addPackage(packageDescriptor: PackageDescriptor, file: File): void {
        this._packageGraph.addNode(packageDescriptor.name);
        this._packageMap[packageDescriptor.name] = file;
    }

    /**
     * Adds a dependency between two packages.
     *
     * @param packageDescriptor The package descriptor of the package that is the 'dependant'.
     * @param packageDependencyName The name of the package that is the 'dependency'.
     */
    public addPackageDependency(packageDescriptor: PackageDescriptor, packageDependencyName: string): void {
        this._packageGraph.addNode(packageDependencyName);
        this._packageGraph.addDependency(packageDescriptor.name, packageDependencyName);
    }

    /**
     * Writes the current collection of packages to a stream in dependency order.
     *
     * @param targetStream The stream that will be written.
     * @param callback A function that will be called when complete.
     * @param transformFunc An optional function that can transform the 'Gulp' file before it is written to the
     * stream.
     */
    public writeToStream(targetStream: NodeJS.ReadWriteStream, callback: Function, transformFunc?: (file: File) => File): void {
        let collectFunc = function(packageName: string) {
            var packageFile: File = this._packageMap[packageName];

            if (packageFile) {
                packageFile = transformFunc ? transformFunc(packageFile) : packageFile;

                (<any>targetStream).push(packageFile);
            }
        }

        let requiredPackageName = getPackageName();

        if (requiredPackageName) {
            this._packageGraph.dependenciesOf(requiredPackageName).forEach(collectFunc, this);
            collectFunc.call(this, requiredPackageName);

        }
        else {
            this._packageGraph.overallOrder().forEach(collectFunc, this);
        }

        callback();
    }
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
export function workspacePackages(options?: gulp.SrcOptions): NodeJS.ReadWriteStream {
    options = _.extend(options || { }, { read: true });

    let context = new CollectContext();

    return gulp.src([ "./package.json", "./*/package.json" ], options)
        .pipe(through.obj(collectPackages(context), streamPackages(context)));
}


/**
 * Returns a [[TransformAction]] that pushes 'package.json' files into a [[CollectContext]] object.
 *
 * @param context The [[CollectContext]] to use when collecting the 'package.json' files.
 *
 * @returns A [[TransformAction]] function.
 *
 * [[collectPackages]] does not write the received 'package.json' files into the output stream. Instead
 * it simply gathers them into the supplied [[CollectContext]] object. [[streamPackages]] can be used as
 * a flush function to output the received 'package.json' files in dependency order once all the files
 * have been received.
 */
function collectPackages(context: CollectContext): TransformAction {
    return function (file: File, encoding, callback: Function) {
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
 * Returns a [[CompleteAction]] that streams the 'package.json' files from a given [[CollectContext]].
 *
 * @param context The [[CollectContext]] from which to stream 'package.json' files.
 *
 * @returns A [[CompleteAction]] function.
 *
 * The supplied [[CollectContext]] object will stream the 'package.json' files in dependency order.
 */
function streamPackages(context: CollectContext): CompleteAction {
    return function (callback: Function) {
        context.writeToStream(this, callback, (file: File) => {
            let workspaceFilePath = path.join(path.parse(file.path).dir, LOCAL_GULP_WORKSPACE_FILENAME);

            let getWorkspaceFunc = function() {
                return fs.existsSync(workspaceFilePath) ? require(workspaceFilePath) : { };
            }

            file["getWorkspace"] = getWorkspaceFunc;

            return file;
        });
    };
}
