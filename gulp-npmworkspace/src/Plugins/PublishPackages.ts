import * as util from "gulp-util";
import {Promise} from "es6-promise";
import * as semver from "semver";
import * as jsonFile from "jsonfile";
import File = require("vinyl");

import {ConditionableAction, AsyncAction} from "./ConditionableAction";
import {NpmPluginBinding} from "./utilities/NpmPluginBinding";
import {packageDescriptorPlugin} from "./utilities/PackageDescriptorPlugin";
import {PluginError, PluginErrorOptions} from "./utilities/PluginError";
import {NpmWorkspacePluginOptions, VersionBump, getWorkspacePluginOptions} from "../NpmWorkspacePluginOptions";
import {PackageDescriptor} from "../PackageDescriptor";
import {Logger} from "./utilities/Logging";

/**
 * Options for npmPublish().
 */
export interface NpmPublishOptions {
    /**
     * true to continue if a workspace package fails to publish.
     *
     * Defaults to true.
     */
    continueOnError?: boolean;

    /**
     * true to generate a shrikwrap file before publishing.
     *
     * Default to true.
     */
    shrinkWrap?: boolean;

    /**
     * A combination of a condition and an action that will be executed prior to the package being published.
     */
    prePublishActions?: Array<ConditionableAction<AsyncAction>>;
}

/**
 * Creates a binding for the [[npmPublish]] plugin.
 *
 * @returns An [[NpmPluginBinding<>]] object.
 */
function npmPublishPackageBinding(options?: NpmPublishOptions & NpmWorkspacePluginOptions): NpmPluginBinding<NpmPublishOptions & NpmWorkspacePluginOptions> {
    return new NpmPluginBinding<NpmPublishOptions & NpmWorkspacePluginOptions>(_.extend(getWorkspacePluginOptions(options), { continueOnError: true, shrinkWrap: true }, options));
}

/**
 * Bumps the version of the given package descriptor and then saves the result to disk.
 *
 * @param packageDescriptor The package descriptor representing the 'package.json' file.
 * @param packagePath The path to the package.
 * @param versionBump The string representation of a version or a [[VersionBump]] value.
 *
 * @returns The modified package descriptor.
 */
function bumpVersion(packageDescriptor: PackageDescriptor, packagePath: string, versionBump: string | VersionBump): PackageDescriptor {
    let versionIncrement = VersionBump[VersionBump[versionBump]];

    let version: string;

    if (versionIncrement) {
        version = semver.inc(packageDescriptor["version"], versionIncrement);
    }
    else {
        version = semver.valid(<string>versionBump);

        if (!version) {
            throw new Error(`'${versionBump}' is not a valid version.`);
        }
    }

    Logger.verbose(`Bumping workspace package '${util.colors.cyan(packageDescriptor["name"])}' to version '${version}'`);

    packageDescriptor["version"] = version;

    jsonFile.writeFileSync(packagePath, packageDescriptor, { spaces: 4 });

    return packageDescriptor;
}

/**
 * The [[npmPublish]] plugin implementation.
 *
 * @param packageDescriptor The package descriptor representing the 'package.json' file.
 * @param packagePath The path to the package.
 * @param packageMap A dictionary of packages that have been processed by the Gulp plugin.
 * @param options A optional hash of [[NpmPublishOptions]] and [[NpmWorkspacePluginOptions]].
 */
function npmPublishPackage(packageDescriptor: PackageDescriptor, packagePath: string, file: File): Promise<void> {
    let pluginBinding: NpmPluginBinding<NpmPublishOptions & NpmWorkspacePluginOptions> = this;

    return new Promise<void>((resolve, reject) => {
        Logger.info(util.colors.bold(`Publishing workspace package '${util.colors.cyan(packageDescriptor.name)}'`));

        let publishFunc = () => {
            if (pluginBinding.options.shrinkWrap) {
                pluginBinding.shellExecuteNpm(packagePath, [ "shrinkwrap" ]);
            }

            let versionBump = pluginBinding.options.versionBump;

            if (versionBump) {
                packageDescriptor = bumpVersion(packageDescriptor, packagePath, versionBump);
            }

            pluginBinding.shellExecuteNpm(packagePath, [ "publish" ]);

            resolve();
        };

        try {
            let prePublishActions: ConditionableAction<AsyncAction>[]
                = [].concat(pluginBinding.options.prePublishActions)
                    .concat(file["getWorkspace"]()["prePublish"]);

            if (prePublishActions) {
                let prePublishActionPromises = prePublishActions.map((prePublishAction) => new Promise<void>((resolve, reject) => {
                    let runPrePublishAction = prePublishAction.condition
                                              ? prePublishAction.condition(packageDescriptor, packagePath)
                                              : true;

                    if (runPrePublishAction) {
                        (<AsyncAction>prePublishAction.action)(packageDescriptor, packagePath, (error?: Error) => {
                            if (error) return reject(error);

                            resolve();
                        });
                    }
                    else {
                        resolve();
                    }
                }));

                Promise.all(prePublishActionPromises)
                       .then(() => { publishFunc(); })
                       .catch((error) => {
                           handleError(error, packageDescriptor.name, pluginBinding.options.continueOnError, reject);
                       });
            }
            else {
                publishFunc();
            }
        }
        catch (error) {
            handleError(error, packageDescriptor.name, pluginBinding.options.continueOnError, reject);
        }
    });
}

function handleError(error: any, packageName: string, continueOnError: boolean, rejectFunc: (error?: any) => void) {
    rejectFunc(new PluginError("Error publishing a workspace package",
                               `Error publishing workspace package '${util.colors.cyan(packageName)}':\n${util.colors.red(error.message)}`,
                               { continue: continueOnError }));
}

/**
 * A Gulp plugin that accepts and returns a stream of 'package.json' files and publishes each one.
 *
 * @param options A optional hash of [[NpmPublishOptions]].
 *
 * @returns A stream that contains the 'package.json' files.
 */
export var npmPublish: (options?: NpmPublishOptions & NpmWorkspacePluginOptions) => NodeJS.ReadWriteStream = packageDescriptorPlugin(npmPublishPackage, npmPublishPackageBinding);
