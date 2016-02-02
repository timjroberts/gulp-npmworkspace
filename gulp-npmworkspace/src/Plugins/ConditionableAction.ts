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
