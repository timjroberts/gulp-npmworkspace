import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as childProcess from "child_process";
import * as gulp from "gulp";
import * as util from "gulp-util";
import * as through from "through2";
import * as _ from "underscore";
import * as semver from "semver";
import * as rimraf from "rimraf";
import {DepGraph} from "dependency-graph";
import File = require("vinyl");

import {Dictionary,
        PackageDescriptor,
        GulpReadWriteStream} from "./interfaces";

import {NpmInstallOptions,
        NpmScriptOptions,
        PostInstallOption,
        PostIntallAction} from "./options";

import {pluginName,
        Logger,
        argv} from "./plugin";

/**
 * Returns a stream of 'package.json' files that have been found in the workspace. The files
 * are streamed in dependency order.
 *
 * @param options A hash of options that can be passed through to gulp.src().
 */
export function workspacePackages(options?: Object): NodeJS.ReadWriteStream {
    options = _.defaults(options || { }, { });

    let packagesStream = gulp.src(["./*/package.json", "!./package.json"], options);
    let packageGraph = new DepGraph();
    let packageMap: Dictionary<File> = { };

    let collector = <GulpReadWriteStream>through.obj((file: File, encoding, callback) => {
        if (file.isStream()) return callback(new util.PluginError(pluginName, "Streams are not supported."));

        let packageDescriptor: PackageDescriptor = JSON.parse(file.contents.toString());

        packageGraph.addNode(packageDescriptor.name);
        packageMap[packageDescriptor.name] = file;

        let packageDependencies: Dictionary<string> = { };

        _.extend(packageDependencies, packageDescriptor.dependencies, packageDescriptor.devDependencies, packageDescriptor.optionalDependencies);

        for (let packageName in packageDependencies) {
            packageGraph.addNode(packageName);
            packageGraph.addDependency(packageDescriptor.name, packageName);
        }

        callback();
    });

    packagesStream.on("end", () => {
        let collectorFunc = function(packageName) {
            var packageFile = packageMap[packageName];

            // Only stream packages that are in the workspace
            if (!packageFile) return;

            collector.push(packageFile);
        };

        if (argv.package) {
            // Only return packages that are dependencies of (and including) the given
            // starting package

            if (!packageMap[argv.package]) {
                Logger.error(util.colors.red(`Package '${util.colors.cyan(argv.package)}' could not be found in the workspace.`));

                return;
            }

            packageGraph.dependenciesOf(argv.package).forEach(collectorFunc, this);
            collectorFunc.call(this, argv.package);
        }
        else {
            // Return all packages
            packageGraph.overallOrder().forEach(collectorFunc, this);
        }
    });

    return packagesStream.pipe(collector);
}


/**
 * Accepts and returns a stream of 'package.json' files and applies a filter function to each one in order to
 * determine if the file should be included in the returned stream or not.
 *
 * @param filterFunc A function that accepts a package descriptor and returns a boolean where false removes
 * the file from the stream.
 */
export function filter(filterFunc: (packageDescriptor: PackageDescriptor) => boolean): NodeJS.ReadWriteStream {
    return through.obj(function(file: File, encoding, callback) {
        var packageDescriptor = JSON.parse(file.contents.toString());

        if (filterFunc(packageDescriptor)) {
            return callback(null, file);
        }

        callback();
    });
}


/**
 * Accepts and returns a stream of 'package.json' files and executes the given script for each one.
 *
 * @param scriptName The name of the script that should be executed.
 * @param options A hash of options.
 */
export function npmScript(scriptName: string, options?: NpmScriptOptions): NodeJS.ReadWriteStream {
    options = _.defaults(options || { }, { ignoreMissingScript: true, continueOnError: true });

    return through.obj(function (file: File, encoding, callback) {
        if (file.isStream()) return callback(new util.PluginError(pluginName, "Streams not supported."));

        let pathInfo = path.parse(file.path);

        if (pathInfo.base !== "package.json") return callback(new util.PluginError(pluginName, "Expected a 'package.json' file."));

        let packageDescriptor: PackageDescriptor = JSON.parse(file.contents.toString());

        Logger.info(`Running script '${scriptName}' for workspace package '${util.colors.cyan(packageDescriptor.name)}`);

        if (!packageDescriptor.scripts[scriptName] && !options.ignoreMissingScript) {
            let error = new Error(`Workspace package '${packageDescriptor.name}' does not contain a '${scriptName}' script.`);

            Logger.error(util.colors.red(error.message));

            return callback(error, null);
        }

        try {
            let result = shellExecute(pathInfo.dir, packageDescriptor.scripts[scriptName]);

            Logger.info(result);

            callback(null, file);
        }
        catch (error) {
            Logger.error(util.colors.red(`Error running script '${scriptName}' for workspace package '${util.colors.cyan(packageDescriptor.name)}'`));
            Logger.error(util.colors.red(error));

            callback(options.continueOnError ? null : error, file);
        }
    });
}


/**
 * Accepts and returns a stream of 'package.json' files and installs the dependant packages for each one.
 * Symbolic links are created for each dependency if it is present in the workspace.
 *
 * @param options A hash of options.
 */
export function npmInstall(options?: NpmInstallOptions) {
    options = _.defaults(options || { }, { continueOnError: true, minimizeSizeOnDisk: true, registryMap: { } });

    let packageMap: Dictionary<string> = { };

    let lookupRegistryDependencies = function(registry: string, registryMap: Dictionary<Array<string>>): Array<string> {
        if (!registry) return registryMap["*"];

        let dependencies: Array<string> = registryMap[registry];

        if (!dependencies) {
            dependencies = [ ];
            registryMap[registry] = dependencies;
        }

        return dependencies;
    };

    let toSemverRange = function(version: string): string {
        let matches = /^(\^|~)?(?:(\d+)\.?)(?:(\d+)\.?)?(?:(\d+)\.?)?/g.exec(version);

        if (!matches) return `"${version}"`;

        if (matches[1] === "^") {
            return `^${matches[2]}.x.x`;
        }
        else {
            return `^${matches[2]}.${matches[3] ? matches[3] : "x"}.x`;
        }
    }

    return through.obj(function (file: File, encoding, callback) {
        if (file.isStream()) return callback(new util.PluginError("install", "Streams not supported."));

        let pathInfo = path.parse(file.path);

        if (pathInfo.base !== "package.json") return callback(new util.PluginError("install", "Expected a 'package.json' file."));

        let packageDescriptor = JSON.parse(file.contents.toString());

        Logger.info(`Installing workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

        packageMap[packageDescriptor.name] = pathInfo.dir;

        let workspaceDependencies: Dictionary<Array<string>> = { "*": [ ] };
        let packageDependencies: Dictionary<Array<string>> = { "*": [ ] };

        let dependencyPath: string;

        try {
            for (let packageName in packageDescriptor.dependencies) {
                dependencyPath = packageMap[packageName];

                if (dependencyPath) {
                    if (options.registryMap[packageName]) {
                        Logger.warn(util.colors.yellow(`Workspace package '${packageName}' has an entry in options.registryMap. Ignoring.`));
                    }

                    createPackageSymLink(pathInfo.dir, packageName, dependencyPath);

                    Logger.verbose(`Linked '${util.colors.cyan(packageName)}' (-> '${util.colors.blue(dependencyPath)}')`);

                    continue;
                }

                lookupRegistryDependencies(options.registryMap[packageName], packageDependencies)
                    .push(`${packageName}@${toSemverRange(packageDescriptor.dependencies[packageName])}`);
            }

            let devDependencies: Dictionary<string> = { };

            _.extend(devDependencies, packageDescriptor.devDependencies, packageDescriptor.optionalDependencies);

            for (var packageName in devDependencies) {
                dependencyPath = packageMap[packageName];

                if (dependencyPath) {
                    createPackageSymLink(pathInfo.dir, packageName, dependencyPath);

                    Logger.verbose(`Linked '${util.colors.cyan(packageName)}' (-> '${util.colors.blue(dependencyPath)}')`);

                    continue;
                }

                if (!options.minimizeSizeOnDisk) {
                    // Don't care about minimizing size on disk, so install it in the package
                    lookupRegistryDependencies(options.registryMap[packageName], packageDependencies)
                        .push(`${packageName}@${toSemverRange(packageDescriptor.devDependencies[packageName])}`);

                    continue;
                }

                let workspacePackagePath = path.join(process.cwd(), "node_modules", packageName);

                if (!fs.existsSync(workspacePackagePath)) {
                    // Doesn't exist in the workspace, so install it there
                    lookupRegistryDependencies(options.registryMap[packageName], workspaceDependencies)
                        .push(`${packageName}@${toSemverRange(packageDescriptor.devDependencies[packageName])}`);
                }
                else {
                    // Does exist in the workspace, so if the version there satisfies our version requirements do nothing
                    // and we'll use that version; otherwise, install it in the package
                    let workspacePackageVersion = require(path.join(workspacePackagePath, "package.json")).version;

                    if (!semver.satisfies(workspacePackageVersion, packageDescriptor.devDependencies[packageName])) {
                        lookupRegistryDependencies(options.registryMap[packageName], packageDependencies)
                            .push(`${packageName}@${toSemverRange(packageDescriptor.devDependencies[packageName])}`);

                        Logger.warn(util.colors.yellow(`Package '${packageName}' cannot be satisfied by version ${workspacePackageVersion}. Installing locally.`));
                    }
                }
            }

            Logger.verbose((logger) => {
                let log = function(level: string, registryPackages: Dictionary<Array<string>>) {
                    for (let registry in registryPackages) {
                        let packages = registryPackages[registry];

                        if (!packages || packages.length === 0) continue;

                        logger(`  ${registry}`);
                        packages.forEach((p) => { logger(`    - ${p} (${level})`); });
                    }
                };

                logger(`options.minimizeSizeOnDisk = ${options.minimizeSizeOnDisk}`)
                log("workspace package", packageDependencies);
                log("workspace", workspaceDependencies);
            });

            shellExecuteNpmInstall(pathInfo.dir, packageDependencies);
            shellExecuteNpmInstall(process.cwd(), workspaceDependencies);

            if (options.postInstall) {
                let runPostInstall = true;

                if (options.postInstall.condition) runPostInstall = options.postInstall.condition(packageDescriptor, pathInfo.dir);

                Logger.info(`Running post-install action for workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

                if (runPostInstall && typeof options.postInstall.action === "string") {
                    shellExecute(pathInfo.dir, <string>options.postInstall.action);
                }
                else if (runPostInstall && typeof options.postInstall.action === "function") {
                    (<PostIntallAction>options.postInstall.action)(packageDescriptor, pathInfo.dir);
                }
            }

            callback(null, file);
        }
        catch (error) {
            let message = `Error installing workspace package '${util.colors.cyan(packageDescriptor.name)}'`;

            Logger.error(message + os.EOL + error.message);

            callback(options.continueOnError ? null
                                             : new util.PluginError(pluginName, message, { showProperties: false, showStack: false}),
                     file);
        }
    });
}


/**
 * Accepts and returns a stream of 'package.json' files and uninstalls all dependant packages for each one.
 */
export function npmUninstall(): NodeJS.ReadWriteStream {
    return through.obj(function (file: File, encoding, callback) {
        if (file.isStream()) return callback(new util.PluginError("install", "Streams not supported."));

        var pathInfo = path.parse(file.path);

        if (pathInfo.base !== "package.json") return callback(new util.PluginError(pluginName, "Expected a 'package.json' file."));

        var packageDescriptor: PackageDescriptor = JSON.parse(file.contents.toString());

        Logger.info(`Uninstalling workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

        rimraf.sync(path.resolve(pathInfo.dir, "node_modules"));
        rimraf.sync(path.resolve(process.cwd(), "node_modules"));

        callback(null, file);
    });
}


function createPackageSymLink(sourcePath: string, packageName: string, targetPath: string): void {
    sourcePath = path.resolve(sourcePath, "node_modules");

    if (fs.existsSync(path.resolve(sourcePath, packageName))) return;
    if (!fs.existsSync(sourcePath)) fs.mkdirSync(sourcePath);

    fs.symlinkSync(targetPath, path.join(sourcePath, packageName), "dir");
}


function shellExecuteNpmInstall(packagePath: string, registryPackages: Dictionary<Array<string>>): void {
    for (let registry in registryPackages) {
        let packages = registryPackages[registry];

        if (!packages || packages.length === 0) continue;

        var installArgs = ["install"].concat(packages);

        if (packagePath === process.cwd()) {
            installArgs.push("--ignore-scripts");
        }

        installArgs.push("--production");

        if (registry !== "*") {
            installArgs.push("--registry");
            installArgs.push(registry);
        }

        Logger.verbose((logger) => {
            logger(`npm ${installArgs.join(" ")}`);
        });

        var result = childProcess.spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", installArgs, { cwd: packagePath });

        if (result.status !== 0) throw new Error(result.stderr.toString());
    }
}


function shellExecute(packagePath: string, shellCommand: string): string {
    shellCommand = shellCommand.replace(/node_modules|\.\/node_modules/g, "../node_modules");

    var result = childProcess.execSync(shellCommand, { cwd: packagePath });

    return result.toString();
}