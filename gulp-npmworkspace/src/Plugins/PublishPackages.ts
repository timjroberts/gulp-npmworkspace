import * as util from "gulp-util";
import {Promise} from "es6-promise";

import {ConditionableAction, AsyncAction} from "./ConditionableAction";
import {NpmPluginBinding} from "./utilities/NpmPluginBinding";
import {packageDescriptorPlugin} from "./utilities/PackageDescriptorPlugin";
import {PluginError, PluginErrorOptions} from "./utilities/PluginError";
import {NpmWorkspacePluginOptions, getWorkspacePluginOptions} from "../NpmWorkspacePluginOptions";
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
 * The [[npmPublish]] plugin implementation.
 *
 * @param packageDescriptor The package descriptor representing the 'package.json' file.
 * @param packagePath The path to the package.
 * @param packageMap A dictionary of packages that have been processed by the Gulp plugin.
 * @param options A optional hash of [[NpmPublishOptions]] and [[NpmWorkspacePluginOptions]].
 */
function npmPublishPackage(packageDescriptor: PackageDescriptor, packagePath: string): Promise<void> {
    let pluginBinding: NpmPluginBinding<NpmPublishOptions & NpmWorkspacePluginOptions> = this;

    return new Promise<void>((resolve, reject) => {
        Logger.info(`Publishing workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

        try {
            if (pluginBinding.options.prePublishActions) {
                let prePublishActionPromises = pluginBinding.options.prePublishActions.map((prePublishAction) => new Promise<void>((resolve, reject) => {
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
                       .then(() => { resolve(); })
                       .catch((error) => {
                           throw error;
                       });
            }
        }
        catch (error) {
            reject(new PluginError("Error publishing a workspace package",
                                   `Error publishing workspace package '${util.colors.cyan(packageDescriptor.name)}': \n ${error.message}`,
                                   { continue: pluginBinding.options.continueOnError }));
        }
    });
}

/**
 * A Gulp plugin that accepts and returns a stream of 'package.json' files and publishes each one.
 *
 * @param options A optional hash of [[NpmPublishOptions]].
 *
 * @returns A stream that contains the 'package.json' files.
 */
export var npmPublish: (options?: NpmPublishOptions & NpmWorkspacePluginOptions) => NodeJS.ReadWriteStream = packageDescriptorPlugin(npmPublishPackage, npmPublishPackageBinding);
