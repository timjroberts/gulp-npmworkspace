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
import * as jsonFile from "jsonfile";
import {DepGraph} from "dependency-graph";
import File = require("vinyl");

import {Dictionary,
        PackageDescriptor,
        GulpReadWriteStream} from "./interfaces";

import {NpmInstallOptions,
        NpmScriptOptions,
        NpmPublishOptions,
        ConditionableOption,
        VersionIncrement,
        AsyncAction} from "./options";

import {pluginName,
        Logger,
        argv,
        argvProjectName, argvExclusiveProjectName,
        bumpVersion} from "./plugin";

const LINKED_TYPINGS_FOLDER_NAME: string = ".typings";

/**
 * Returns a stream of 'package.json' files that have been found in the workspace. The files
 * are streamed in dependency order.
 *
 * @param options A hash of options that can be passed through to gulp.src().
 */
export function workspacePackages(options?: Object): NodeJS.ReadWriteStream {
    options = _.defaults(options || { }, { });

    let requiredPackageName = argvProjectName();

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

            let workspaceFilePath = path.join(path.parse(packageFile.path).dir, "gulpfile.workspace.js");

            let getWorkspaceFunc = function() {
                return fs.existsSync(workspaceFilePath) ? require(workspaceFilePath) : { };
            }

            packageFile["getWorkspace"] = getWorkspaceFunc;

            collector.push(packageFile);
        };


        if (requiredPackageName) {
            // Only return packages that are dependencies of (and including) the given
            // starting package

            if (!packageMap[requiredPackageName]) {
                Logger.error(util.colors.red(`Package '${util.colors.cyan(requiredPackageName)}' could not be found in the workspace.`));

                return;
            }

            packageGraph.dependenciesOf(requiredPackageName).forEach(collectorFunc, this);
            collectorFunc.call(this, requiredPackageName);
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
export function filter(filterFunc: (packageDescriptor: PackageDescriptor, path: string) => boolean): NodeJS.ReadWriteStream {
    return through.obj(function(file: File, encoding, callback) {
        var packageDescriptor = JSON.parse(file.contents.toString());

        if (filterFunc(packageDescriptor, path.parse(file.path).dir)) {
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

    let requiredPackageName = argvExclusiveProjectName();

    return through.obj(function (file: File, encoding, callback) {
        if (file.isStream()) return callback(new util.PluginError(pluginName, "Streams not supported."));

        let pathInfo = path.parse(file.path);

        if (pathInfo.base !== "package.json") return callback(new util.PluginError(pluginName, "Expected a 'package.json' file."));

        let packageDescriptor: PackageDescriptor = JSON.parse(file.contents.toString());

        if (requiredPackageName && packageDescriptor.name !== requiredPackageName) {
            return callback(null, file);
        }

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
 * Accepts and returns a stream of 'package.json' files and performs a npm publish for each one.
 *
 * @param options A hash of options.
 */
export function npmPublish(options?: NpmPublishOptions): NodeJS.ReadWriteStream {
    options = _.defaults(options || { }, { continueOnError: true, shrinkWrap: true, bump: undefined });

    let requiredPackageName = argvExclusiveProjectName();

    return through.obj(function (file: File, encoding, callback) {
        if (file.isStream()) return callback(new util.PluginError(pluginName, "Streams not supported."));

        let pathInfo = path.parse(file.path);

        if (pathInfo.base !== "package.json") return callback(new util.PluginError(pluginName, "Expected a 'package.json' file."));

        let packageDescriptor = JSON.parse(file.contents.toString());

        if (requiredPackageName && packageDescriptor.name !== requiredPackageName) {
            return callback(null, file);
        }

        let publishFunc = function() {
            try {
                if (options.shrinkWrap) {
                    shellExecuteNpm(pathInfo.dir, [ "shrinkwrap" ]);
                }

                let bump: string | VersionIncrement = bumpVersion() || options.bump;

                if (bump) {
                    file.contents = applyVersionBump(file.path, packageDescriptor, bump);
                }

                shellExecuteNpm(pathInfo.dir, [ "publish" ]);

                callback(null, file);
            }
            catch (error) {
                let message = `Error publishing workspace package '${util.colors.cyan(packageDescriptor.name)}'`;

                Logger.error(message + os.EOL + error.message);

                callback(options.continueOnError ? null
                                                 : new util.PluginError(pluginName, message, { showProperties: false, showStack: false}),
                         file);
            }
        }

        let prePublishAction = <AsyncAction>file["getWorkspace"]()["prePublish"];

        if (prePublishAction && typeof prePublishAction === "function") {
            Logger.info(`Running pre-publish action for workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

            prePublishAction(pathInfo.dir, packageDescriptor, (error?: Error) => {
                if (error) {
                    let message = `Pre-publish action failed for workspace package '${util.colors.cyan(packageDescriptor.name)}'`;

                    Logger.error(message + os.EOL + error.message);

                    if (!options.continueOnError) {
                        return callback(new util.PluginError(pluginName, message, { showProperties: false, showStack: false}), file);
                    }
                }

                publishFunc();
            });
        }
        else {
            publishFunc();
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

    let requiredPackageName = argvExclusiveProjectName();

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

        if (!matches || !matches[1]) return version;

        if (matches[1] === "^") {
            return `^${matches[2]}.x.x`;
        }
        else {
            return `~${matches[2]}.${matches[3] ? matches[3] : "x"}.x`;
        }
    }

    return through.obj(function (file: File, encoding, callback) {
        if (file.isStream()) return callback(new util.PluginError(pluginName, "Streams not supported."));

        let pathInfo = path.parse(file.path);

        if (pathInfo.base !== "package.json") return callback(new util.PluginError(pluginName, "Expected a 'package.json' file."));

        let packageDescriptor = JSON.parse(file.contents.toString());

        packageMap[packageDescriptor.name] = pathInfo.dir;

        if (requiredPackageName && packageDescriptor.name !== requiredPackageName) {
            return callback(null, file);
        }

        Logger.info(`Installing workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

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

                        logger(`  ${util.colors.blue(registry)}`);
                        packages.forEach((p) => { logger(`    - ${util.colors.cyan(p)} (${level})`); });
                    }
                };

                logger("Installing:")
                log("workspace package", packageDependencies);
                log("workspace", workspaceDependencies);
            });

            shellExecuteNpmInstall(pathInfo.dir, packageDependencies);
            shellExecuteNpmInstall(process.cwd(), workspaceDependencies);

            // Create links to any typings
            let packageTypingsFilePath = path.join(pathInfo.dir, "typings.json");

            if (fs.existsSync(packageTypingsFilePath)) {
                let packageTypingsPath = path.join(pathInfo.dir, LINKED_TYPINGS_FOLDER_NAME);

                if (!fs.existsSync(packageTypingsPath)) fs.mkdirSync(packageTypingsPath);

                rimraf.sync(packageTypingsPath + "/**/*");

                let typingFilePaths = getTypingFileReferences(require(packageTypingsFilePath));

                for (let typingFilePathEntry in typingFilePaths) {
                    let typingFilePath = path.resolve(pathInfo.dir, typingFilePaths[typingFilePathEntry]);
                    let targetTypingFilePath = path.join(packageTypingsPath, typingFilePathEntry);

                    fs.mkdirSync(targetTypingFilePath);

                    fs.symlinkSync(typingFilePath, path.join(targetTypingFilePath, `${typingFilePathEntry}.d.ts`));

                    Logger.verbose(`Linked typing '${util.colors.cyan(typingFilePathEntry)}' (-> '${util.colors.blue(typingFilePath)}')`);
                }
            }

            if (options.postInstall) {
                let runPostInstall = true;

                if (options.postInstall.condition) runPostInstall = options.postInstall.condition(packageDescriptor, pathInfo.dir);

                Logger.info(`Running post-install action for workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

                if (runPostInstall && typeof options.postInstall.action === "string") {
                    shellExecute(pathInfo.dir, <string>options.postInstall.action);
                }
                else if (runPostInstall && typeof options.postInstall.action === "function") {
                    (<AsyncAction>options.postInstall.action)(pathInfo.dir, packageDescriptor, (error?: Error) => {
                        if (error) {
                            let message = `Post-install action failed for workspace package '${util.colors.cyan(packageDescriptor.name)}'`;

                            Logger.error(message + os.EOL + error.message);

                            if (!options.continueOnError) {
                                return callback(new util.PluginError(pluginName, message, { showProperties: false, showStack: false}), file);
                            }
                        }

                        callback(null, file);
                    });
                }
            }
            else {
                callback(null, file);
            }
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
    let requiredPackageName = argvExclusiveProjectName();

    return through.obj(function (file: File, encoding, callback) {
        if (file.isStream()) return callback(new util.PluginError(pluginName, "Streams not supported."));

        var pathInfo = path.parse(file.path);

        if (pathInfo.base !== "package.json") return callback(new util.PluginError(pluginName, "Expected a 'package.json' file."));

        var packageDescriptor: PackageDescriptor = JSON.parse(file.contents.toString());

        if (requiredPackageName && packageDescriptor.name !== requiredPackageName) {
            return callback(null, file);
        }

        Logger.info(`Uninstalling workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

        rimraf.sync(path.resolve(pathInfo.dir, "node_modules"));
        rimraf.sync(path.resolve(pathInfo.dir, LINKED_TYPINGS_FOLDER_NAME));

        callback(null, file);
    });
}


function getTypingFileReferences(typingsDescriptor: Object): Dictionary<string> {
    let typingPaths: Dictionary<string> = { };

    for (let d in typingsDescriptor) {
        for (let ds in typingsDescriptor[d]) {
            let typingReference: string = typingsDescriptor[d][ds];

            let result = /file:(.*)/g.exec(typingReference);

            if (result) typingPaths[ds] = result[1];
        }
    }

    return typingPaths;
}


function createPackageSymLink(sourcePath: string, packageName: string, targetPath: string): void {
    sourcePath = path.resolve(sourcePath, "node_modules");

    if (fs.existsSync(path.resolve(sourcePath, packageName))) return;
    if (!fs.existsSync(sourcePath)) fs.mkdirSync(sourcePath);

    fs.symlinkSync(targetPath, path.join(sourcePath, packageName), "dir");
}


function shellExecuteNpm(packagePath: string, cmdArgs: Array<string>): void {
    var result = childProcess.spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", cmdArgs, { cwd: packagePath });

    if (result.status !== 0) {
        Logger.verbose((logger) => {
            logger(`npm ${cmdArgs.join(" ")}`);
        });

        throw new Error(result.stderr.toString());
    }
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

        shellExecuteNpm(packagePath, installArgs);
    }
}


function shellExecute(packagePath: string, shellCommand: string): string {
    shellCommand = shellCommand.replace(/node_modules|\.\/node_modules/g, "../node_modules");

    var result = childProcess.execSync(shellCommand, { cwd: packagePath });

    return result.toString();
}


function applyVersionBump(packageFilePath: string, packageDescriptor: Object, bump: string | VersionIncrement): Buffer {
    let versionIncrement = VersionIncrement[VersionIncrement[bump]];

    let version: string;

    if (versionIncrement) {
        version = semver.inc(packageDescriptor["version"], versionIncrement);
    }
    else {
        version = semver.valid(<string>bump);

        if (!version) {
            throw new Error(`'${bump}' is not a valid version.`);
        }
    }

    Logger.verbose(`Bumping workspace package '${util.colors.cyan(packageDescriptor["name"])}' to version '${version}'`);

    packageDescriptor["version"] = version;

    jsonFile.writeFileSync(packageFilePath, packageDescriptor, { spaces: 4 });


    return new Buffer(JSON.stringify(packageDescriptor));
}
