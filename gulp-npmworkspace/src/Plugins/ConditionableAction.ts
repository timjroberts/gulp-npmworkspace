import {Promise} from "es6-promise";

import {PackageDescriptor} from "../PackageDescriptor";

/**
 * An action that is asynchronous.
 */
export interface AsyncAction {
    (packageDescriptor: PackageDescriptor, packagePath: string, callback: (error?: Error) => void): void;
}

/**
 * An action that is synchronous.
 */
export interface SyncAction {
    (packageDescriptor: PackageDescriptor, packagePath: string): void;
}

/**
 * An action that it only executed for a given condition.
 */
export interface ConditionableAction<TAction> {
    /**
     * An optional condition function that if returns true will apply the associated action. If no condition is
     * supplied, then the action is always applied.
     */
    condition?: (packageDescriptor: PackageDescriptor, packagePath: string) => boolean;

    /**
     * The action to execute.
     */
    action: TAction;
}

/**
 * Synchronously executes a collection of [[ConditionableAction<AsyncAction>]] objects in order.
 *
 * @param actions An array of actions to be executed.
 * @param packageDescriptor The package descriptor to pass into the actions.
 * @param packagePath The package path to pass into the actions.
 *
 * @returns A Promise that yields once all actions have executed.
 */
export function executeAsynchronousActions(actions: ConditionableAction<AsyncAction>[], packageDescriptor: PackageDescriptor, packagePath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let iterate = function(currentIdx: number) {
            if (currentIdx < actions.length) {
                let action = actions[currentIdx];

                let runAction = action.condition ? action.condition(packageDescriptor, packagePath) : true;

                if (runAction) {
                    (<AsyncAction>action.action)(packageDescriptor, packagePath, (error?: Error) => {
                        if (error) return reject(error);

                        iterate(currentIdx + 1);
                    });
                }
                else {
                    iterate(currentIdx + 1);
                }
            }
            else {
                resolve();
            }
        };

        iterate(0);
    });
}