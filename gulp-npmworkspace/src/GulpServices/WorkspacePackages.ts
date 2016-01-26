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


/**
 * A private class that provides context for the collection of workspace packages.
 */
class CollectContext {
    private _packageGraph: DepGraph;
    private _packageMap: IDictionary<File>;

    constructor() {
        this._packageGraph = new DepGraph();
        this._packageMap = { };
    }

    public addPackage(packageDescriptor: PackageDescriptor, file: File): void {
        this._packageGraph.addNode(packageDescriptor.name);
        this._packageMap[packageDescriptor.name] = file;
    }

    public addPackageDependency(packageDescriptor: PackageDescriptor, packageDependencyName: string): void {
        this._packageGraph.addNode(packageDependencyName);
        this._packageGraph.addDependency(packageDescriptor.name, packageDependencyName);
    }

    public collect(targetStream: NodeJS.ReadWriteStream, transformFunc?: (file: File) => File): void {
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
    let packagesStream = gulp.src([ "./package.json", "./*/package.json" ], options);
    let collector = collectPackages(context);

    packagesStream.once("end", () => { streamCollectedPackages(context, collector); });

    return packagesStream.pipe(collector);
}


/**
 * Accepts a stream of 'package.json' files and passes each one through to the given [[CollectContext]].
 *
 * @param context The [[CollectContext]] to use when collecting the 'package.json' files.
 *
 * @returns A stream that yields nothing.
 *
 * collectPackages() returns a stream that yields no output. Instead, it pushes the received 'package.json'
 * files into the given [[CollectContext]] object which can then be used with streamCollectedPackages()
 * in order to stream the collected 'package.json' files out in dependency order once processed.
 */
function collectPackages(context: CollectContext): NodeJS.ReadWriteStream {
    return through.obj((file: File, _, callback) => {
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
    });
}


/**
 * Returns a stream of 'package.json' files by collecting from the given [[CollectContext]].
 *
 * @param context The [[CollectContext]] to retrieve workspace packages from.
 *
 * @returns A stream of 'package.json' files in dependency order.
 */
function streamCollectedPackages(context: CollectContext, targetStream: NodeJS.ReadWriteStream): void {
    context.collect(targetStream, (file: File) => {
        let workspaceFilePath = path.join(path.parse(file.path).dir, LOCAL_GULP_WORKSPACE_FILENAME);

        let getWorkspaceFunc = function() {
            return fs.existsSync(workspaceFilePath) ? require(workspaceFilePath) : { };
        }

        file["getWorkspace"] = getWorkspaceFunc;

        return file;
    });
}
