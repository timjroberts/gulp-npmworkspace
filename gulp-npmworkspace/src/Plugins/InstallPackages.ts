import * as util from "gulp-util";
import * as _ from "underscore";
import * as path from "path";
import * as fs from "fs";
import {Promise} from "es6-promise";
import * as childProcess from "child_process";
import * as semver from "semver";
import File = require("vinyl");

import {packageDescriptorPlugin, Package} from "./utilities/PackageDescriptorPlugin";
import {PluginError, PluginErrorOptions} from "./utilities/PluginError";
import {NpmWorkspacePluginOptions, getWorkspacePluginOptions} from "../NpmWorkspacePluginOptions";
import {PackageDescriptor} from "../PackageDescriptor";
import {ConditionableAction, AsyncAction, executeAsynchronousActions} from "./ConditionableAction";
import {Logger} from "./utilities/Logging";
import {NpmPluginBinding} from "./utilities/NpmPluginBinding";

/**
 * Options for npmInstall().
 */
export interface NpmInstallOptions {
    /**
     * true to continue if a workspace package fails to install.
     *
     * Defaults to true.
     */
    continueOnError?: boolean;

    /**
     * true to install only the production dependencies.
     *
     * Defaults to false.
     */
    productionOnly?: boolean;

    /**
     * true to apply an installation strategy that attempts to install all devDependencies
     * in the root of the workspace. If a required version cannot be satified by the version
     * installed at the workspace level, then the package is installed locally.
     *
     * Defaults to true.
     */
    minimizeSizeOnDisk?: boolean;

    /**
     * A map between a package name and the npm registry where it should be installed from.
     */
    registryMap?: IDictionary<string>;

    /**
     * A map between a package name and a relative or rooted folder on disk where an external package can
     * be found.
     */
    externalWorkspacePackageMap?: IDictionary<string>;

    /**
     * A combination of a condition and an action that will be executed once the package has been installed.
     */
    postInstallActions?: Array<ConditionableAction<AsyncAction>>;
}

/**
 * Creates a binding for the [[npmInstall]] plugin.
 *
 * @returns An [[NpmPluginBinding<>]] object.
 */
function npmInstallPackageBinding(options?: NpmInstallOptions & NpmWorkspacePluginOptions): NpmPluginBinding<NpmInstallOptions & NpmWorkspacePluginOptions> {
    return new NpmPluginBinding<NpmInstallOptions & NpmWorkspacePluginOptions>(_.extend(getWorkspacePluginOptions(options), { continueOnError: true, productionOnly: false, minimizeSizeOnDisk: true, registryMap: { }, externalWorkspacePackageMap: { } }, options));
}

/**
 * The [[npmInstall]] plugin implementation.
 *
 * @param packageDescriptor The package descriptor representing the 'package.json' file.
 * @param packagePath The path to the package.
 * @param packageMap A dictionary of packages that have been processed by the Gulp plugin.
 */
function npmInstallPackage(packageDescriptor: PackageDescriptor, packagePath: string, file: File, packageMap: IDictionary<Package>): Promise<void> {
    let pluginBinding: NpmPluginBinding<NpmInstallOptions & NpmWorkspacePluginOptions> = this;

    return new Promise<void>((resolve, reject) => {
        Logger.info(util.colors.bold(`Installing workspace package '${util.colors.cyan(packageDescriptor.name)}'`));

        let workspaceDependencies: IDictionary<Array<string>> = { "*": [ ] };
        let packageDependencies: IDictionary<Array<string>> = { "*": [ ] };

        let mappedPackage: Package;
        let externalPackagePath: string;

        try {
            for (let packageName in packageDescriptor.dependencies) {
                mappedPackage = packageMap[packageName];
                externalPackagePath = pluginBinding.options.externalWorkspacePackageMap[packageName];

                if (!pluginBinding.options.disableExternalWorkspaces && (mappedPackage && externalPackagePath)) {
                    Logger.warn(`Package '${packageName}' is both a workspace package and has an entry in options.externalWorkspacePackageMap. Using workspace package.`);
                }

                if (mappedPackage) {
                    linkWorkspacePackage(pluginBinding, packageName, packagePath, mappedPackage.packagePath);

                    //
                    // Bring in any peer dependencies of the package we've just created a link to

                    for (let peerPackageName in mappedPackage.packageDescriptor.peerDependencies) {
                        let peerMappedPackage = packageMap[peerPackageName];

                        if (peerMappedPackage) {
                            linkWorkspacePackage(pluginBinding, peerPackageName, packagePath, peerMappedPackage.packagePath);

                            continue;
                        }

                        lookupRegistryDependencies(pluginBinding.options.registryMap[packageName], packageDependencies)
                            .push(`${peerPackageName}@${pluginBinding.toSemverRange(mappedPackage.packageDescriptor.peerDependencies[peerPackageName])}`);
                    }

                    continue;
                }

                if (!pluginBinding.options.disableExternalWorkspaces && externalPackagePath) {
                    linkExternalPackage(pluginBinding, packageName, packagePath, externalPackagePath);

                    continue;
                }

                lookupRegistryDependencies(pluginBinding.options.registryMap[packageName], packageDependencies)
                    .push(`${packageName}@${pluginBinding.toSemverRange(packageDescriptor.dependencies[packageName])}`);
            }

            //
            // If the current workspace package contains a peer dependency to another workspace package (or an external package), then create a
            // reference to it so that we can resolve it.

            for (let packageName in packageDescriptor.peerDependencies) {
                mappedPackage = packageMap[packageName];
                externalPackagePath = pluginBinding.options.externalWorkspacePackageMap[packageName];

                if (!pluginBinding.options.disableExternalWorkspaces && (mappedPackage && externalPackagePath)) {
                    Logger.warn(`Package '${packageName}' is both a workspace package and has an entry in options.externalWorkspacePackageMap. Using workspace package.`);
                }

                if (mappedPackage) {
                    linkWorkspacePackage(pluginBinding, packageName, packagePath, mappedPackage.packagePath);

                    continue;
                }

                if (!pluginBinding.options.disableExternalWorkspaces && externalPackagePath) {
                    linkExternalPackage(pluginBinding, packageName, packagePath, externalPackagePath);

                    continue;
                }
            }

            if (!pluginBinding.options.productionOnly) {
                let devDependencies: IDictionary<string> = { };

                _.extend(devDependencies, packageDescriptor.devDependencies, packageDescriptor.optionalDependencies);

                for (let packageName in devDependencies) {
                    mappedPackage = packageMap[packageName];
                    externalPackagePath = pluginBinding.options.externalWorkspacePackageMap[packageName];

                    if (!pluginBinding.options.disableExternalWorkspaces && (mappedPackage && externalPackagePath)) {
                        Logger.warn(`Package '${packageName}' is both a workspace package and has an entry in options.externalWorkspacePackageMap. Using workspace package.`);
                    }

                    if (mappedPackage) {
                        linkWorkspacePackage(pluginBinding, packageName, packagePath, mappedPackage.packagePath);

                        continue;
                    }

                    if (!pluginBinding.options.disableExternalWorkspaces && externalPackagePath) {
                        linkExternalPackage(pluginBinding, packageName, packagePath, externalPackagePath);

                        continue;
                    }

                    if (!pluginBinding.options.minimizeSizeOnDisk) {
                        // Don't care about minimizing size on disk, so install it in the package
                        lookupRegistryDependencies(pluginBinding.options.registryMap[packageName], packageDependencies)
                            .push(`${packageName}@${pluginBinding.toSemverRange(packageDescriptor.devDependencies[packageName])}`);

                        continue;
                    }

                    let workspacePackagePath = path.join(pluginBinding.options.cwd, "node_modules", packageName);

                    if (!fs.existsSync(workspacePackagePath)) {
                        // Doesn't exist in the workspace, so install it there
                        lookupRegistryDependencies(pluginBinding.options.registryMap[packageName], workspaceDependencies)
                            .push(`${packageName}@${pluginBinding.toSemverRange(packageDescriptor.devDependencies[packageName])}`);
                    }
                    else {
                        // Does exist in the workspace, so if the version there satisfies our version requirements do nothing
                        // and we'll use that version; otherwise, install it in the package
                        let workspacePackageVersion = require(path.join(workspacePackagePath, "package.json")).version;

                        if (!semver.satisfies(workspacePackageVersion, packageDescriptor.devDependencies[packageName])) {
                            lookupRegistryDependencies(pluginBinding.options.registryMap[packageName], packageDependencies)
                                .push(`${packageName}@${pluginBinding.toSemverRange(packageDescriptor.devDependencies[packageName])}`);

                            Logger.warn(util.colors.yellow(`Package '${packageName}' cannot be satisfied by version ${workspacePackageVersion}. Installing locally.`));
                        }
                    }
                }
            }

            Logger.verbose((logger) => {
                let logDependencies = function(level: string, registryPackages: IDictionary<Array<string>>) {
                    for (let registry in registryPackages) {
                        let packages = registryPackages[registry];

                        if (!packages || packages.length === 0) continue;

                        logger(`  ${util.colors.blue(registry)}`);
                        packages.forEach((p) => { logger(`    - ${util.colors.cyan(p)} (${level})`); });
                    }
                };

                logger("Installing:")
                logDependencies("workspace package", packageDependencies);
                logDependencies("workspace", workspaceDependencies);
            });

            pluginBinding.shellExecuteNpmInstall(packagePath, workspaceDependencies);
            pluginBinding.shellExecuteNpmInstall(packagePath, packageDependencies);

            let postInstallActions: ConditionableAction<AsyncAction>[]
                = _.union(pluginBinding.options.postInstallActions, file["getWorkspace"]()["postInstall"]);

            if (postInstallActions && postInstallActions.length > 0) {
                Logger.verbose(`Running post-install actions for workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

                executeAsynchronousActions(postInstallActions, packageDescriptor, packagePath)
                    .then(resolve)
                    .catch((error) => {
                        handleError(error, packageDescriptor.name, pluginBinding.options.continueOnError, reject);
                    });
            }
            else {
                resolve();
            }
        }
        catch (error) {
            handleError(error, packageDescriptor.name, pluginBinding.options.continueOnError, reject);
        }
    });
}

function handleError(error: any, packageName: string, continueOnError: boolean, rejectFunc: (error?: any) => void) {
    rejectFunc(new PluginError("Error installing a workspace package",
                               `Error installing workspace package '${util.colors.cyan(packageName)}':\n${util.colors.red(error.message)}`,
                               { continue: continueOnError }));
}

/**
 * Looks up the dependencies for a given registry.
 *
 * @param registry The URL to the registry.
 * @param registryMap The map of registry and packages.
 */
function lookupRegistryDependencies(registry: string, registryMap: IDictionary<Array<string>>): Array<string> {
    if (!registry) return registryMap["*"];

    let dependencies: Array<string> = registryMap[registry];

    if (!dependencies) {
        dependencies = [ ];
        registryMap[registry] = dependencies;
    }

    return dependencies;
}

/**
 * Creates a symbolic link between a package and a mapped path where the mapped path is internal to the workspace.
 */
function linkWorkspacePackage(pluginBinding: NpmPluginBinding<NpmInstallOptions & NpmWorkspacePluginOptions>, packageName: string, packagePath: string, mappedPath: string) {
    if (pluginBinding.options.registryMap[packageName]) {
        Logger.warn(util.colors.yellow(`Workspace package '${packageName}' has an entry in options.registryMap. Using workspace package.`));
    }

    pluginBinding.createPackageSymLink(packagePath, packageName, mappedPath);

    Logger.verbose(`Linked '${util.colors.cyan(packageName)}' (-> '${util.colors.blue(mappedPath)}')`);
}

/**
 * Creates a symbolic link between a package and a mapped path where the mapped path is external to the workspace.
 */
function linkExternalPackage(pluginBinding: NpmPluginBinding<NpmInstallOptions & NpmWorkspacePluginOptions>, packageName: string, packagePath: string, mappedPath: string) {
    if (pluginBinding.options.registryMap[packageName]) {
        Logger.warn(util.colors.yellow(`Package '${packageName}' has an entry in options.registryMap. Ignoring.`));
    }

    if (!path.isAbsolute(mappedPath)) {
        mappedPath = path.normalize(path.join(pluginBinding.options.cwd, mappedPath));
    }

    if (mappedPath.indexOf(pluginBinding.options.cwd) >= 0) {
        Logger.warn(util.colors.yellow(`externalWorkspacePackageMap['${packageName}'] is linking to a path inside the current workspace. Ignoring, but it should be removed.`));
    }

    let packageDescriptorPath = path.join(mappedPath, "package.json");

    if (!fs.existsSync(packageDescriptorPath)) {
        throw new Error(`externalWorkspacePackageMap['${packageName}'] is linking to a path that is not a packge. No 'package.json' could be found at '${mappedPath}'.`);
    }

    let packageDescriptor: PackageDescriptor = require(packageDescriptorPath);

    if (packageDescriptor.name !== packageName) {
        throw new Error(`externalWorkspacePackageMap['${packageName}'] is linking to a package that is named differently ('${packageDescriptor.name}').`);
    }

    pluginBinding.createPackageSymLink(packagePath, packageName, mappedPath);

    Logger.verbose(`Linked '${util.colors.cyan(packageName)}' (-> '${util.colors.blue(mappedPath)}') - (${util.colors.bold("external")})`);
}

/**
 * A Gulp plugin that accepts and returns a stream of 'package.json' files and installs the dependant packages for each one.
 * Symbolic links are created for each dependency if it represents another package present in the workspace.
 *
 * @param options A optional hash of [[NpmInstallOptions]].
 *
 * @returns A stream that contains the 'package.json' files.
 */
export var npmInstall: (options?: NpmInstallOptions & NpmWorkspacePluginOptions) => NodeJS.ReadWriteStream = packageDescriptorPlugin(npmInstallPackage, npmInstallPackageBinding);
