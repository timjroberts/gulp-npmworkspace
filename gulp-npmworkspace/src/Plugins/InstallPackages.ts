import * as util from "gulp-util";
import * as _ from "underscore";
import * as path from "path";
import * as fs from "fs";
import {Promise} from "es6-promise";
import * as childProcess from "child_process";
import * as semver from "semver";

import {packageDescriptorPlugin, MappedPackage} from "./utilities/PackageDescriptorPlugin";
import {PluginError, PluginErrorOptions} from "./utilities/PluginError";
import {NpmWorkspacePluginOptions, getWorkspacePluginOptions} from "../NpmWorkspacePluginOptions";
import {PackageDescriptor} from "../PackageDescriptor";
import {ConditionableAction, AsyncAction} from "./ConditionableAction";
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
    return new NpmPluginBinding<NpmInstallOptions & NpmWorkspacePluginOptions>(_.extend(getWorkspacePluginOptions(options), { continueOnError: true, minimizeSizeOnDisk: true, registryMap: { } }, options));
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
 * The [[npmInstall]] plugin implementation.
 *
 * @param packageDescriptor The package descriptor representing the 'package.json' file.
 * @param packagePath The path to the package.
 * @param packageMap A dictionary of packages that have been processed by the Gulp plugin.
 * @param options A optional hash of [[NpmInstallOptions]] and [[NpmWorkspacePluginOptions]].
 */
function npmInstallPackage(packageDescriptor: PackageDescriptor, packagePath: string, packageMap: IDictionary<MappedPackage>): Promise<void> {
    let pluginBinding: NpmPluginBinding<NpmInstallOptions & NpmWorkspacePluginOptions> = this;

    return new Promise<void>((resolve, reject) => {
        Logger.info(`Installing workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

        let workspaceDependencies: IDictionary<Array<string>> = { "*": [ ] };
        let packageDependencies: IDictionary<Array<string>> = { "*": [ ] };

        let mappedPackage: MappedPackage;

        try {
            for (let packageName in packageDescriptor.dependencies) {
                mappedPackage = packageMap[packageName];

                if (mappedPackage) {
                    if (pluginBinding.options.registryMap[packageName]) {
                        Logger.warn(util.colors.yellow(`Workspace package '${packageName}' has an entry in options.registryMap. Ignoring.`));
                    }

                    pluginBinding.createPackageSymLink(packagePath, packageName, mappedPackage.packagePath);

                    Logger.verbose(`Linked '${util.colors.cyan(packageName)}' (-> '${util.colors.blue(mappedPackage.packagePath)}')`);

                    continue;
                }

                lookupRegistryDependencies(pluginBinding.options.registryMap[packageName], packageDependencies)
                    .push(`${packageName}@${pluginBinding.toSemverRange(packageDescriptor.dependencies[packageName])}`);
            }

            let devDependencies: IDictionary<string> = { };

            _.extend(devDependencies, packageDescriptor.devDependencies, packageDescriptor.optionalDependencies);

            for (var packageName in devDependencies) {
                mappedPackage = packageMap[packageName];

                if (mappedPackage) {
                    pluginBinding.createPackageSymLink(packagePath, packageName, mappedPackage.packagePath);

                    Logger.verbose(`Linked '${util.colors.cyan(packageName)}' (-> '${util.colors.blue(mappedPackage.packagePath)}')`);

                    continue;
                }

                if (!pluginBinding.options.minimizeSizeOnDisk) {
                    // Don't care about minimizing size on disk, so install it in the package
                    lookupRegistryDependencies(pluginBinding.options.registryMap[packageName], packageDependencies)
                        .push(`${packageName}@${pluginBinding.toSemverRange(packageDescriptor.devDependencies[packageName])}`);

                    continue;
                }

                let workspacePackagePath = path.join(process.cwd(), "node_modules", packageName);

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

            pluginBinding.shellExecuteNpmInstall(packagePath, workspaceDependencies);
            pluginBinding.shellExecuteNpmInstall(packagePath, packageDependencies);

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

            if (pluginBinding.options.postInstallActions) {
                Logger.info(`Running post-install action for workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

                let postInstallActionPromises = pluginBinding.options.postInstallActions.map((postInstallAction) => new Promise<void>((resolve, reject) => {
                    let runPostAction = postInstallAction.condition
                                        ? postInstallAction.condition(packageDescriptor, packagePath)
                                        : true;

                    if (runPostAction) {
                        (<AsyncAction>postInstallAction.action)(packageDescriptor, packagePath, (error?: Error) => {
                            if (error) return reject(error);

                            resolve();
                        });
                    }
                    else {
                        resolve();
                    }
                }));

                Promise.all(postInstallActionPromises)
                       .then(() => { resolve(); })
                       .catch((error) => {
                           throw error;
                       });
            }
            else {
                resolve();
            }
        }
        catch (error) {
            reject (new PluginError("Error installing a workspace package",
                                    `Error installing workspace package '${util.colors.cyan(packageDescriptor.name)}': \n ${error.message}`,
                                    { continue: pluginBinding.options.continueOnError }));
        }
    });
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
