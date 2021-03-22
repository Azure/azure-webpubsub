import * as coreHttp from "@azure/core-http";

/**
 * Defines values for Enum0.
 */
export type Enum0 = "sendToGroup" | "joinLeaveGroup" | string;
/**
 * Defines values for Enum1.
 */
export type Enum1 = "sendToGroup" | "joinLeaveGroup" | string;
/**
 * Defines values for Enum2.
 */
export type Enum2 = "sendToGroup" | "joinLeaveGroup" | string;

/**
 * Optional parameters.
 */
export interface WebPubSubSendToAll$binaryOptionalParams
  extends coreHttp.OperationOptions {
  /**
   * Excluded connection Ids.
   */
  excluded?: string[];
}

/**
 * Optional parameters.
 */
export interface WebPubSubSendToAll$textOptionalParams
  extends coreHttp.OperationOptions {
  /**
   * Excluded connection Ids.
   */
  excluded?: string[];
}

/**
 * Optional parameters.
 */
export interface WebPubSubSendToAll$jsonOptionalParams
  extends coreHttp.OperationOptions {
  /**
   * Excluded connection Ids.
   */
  excluded?: string[];
}

/**
 * Optional parameters.
 */
export interface WebPubSubCloseClientConnectionOptionalParams
  extends coreHttp.OperationOptions {
  /**
   * The reason closing the client connection.
   */
  reason?: string;
}

/**
 * Optional parameters.
 */
export interface WebPubSubSendToGroup$binaryOptionalParams
  extends coreHttp.OperationOptions {
  /**
   * Excluded connection Ids
   */
  excluded?: string[];
}

/**
 * Optional parameters.
 */
export interface WebPubSubSendToGroup$textOptionalParams
  extends coreHttp.OperationOptions {
  /**
   * Excluded connection Ids
   */
  excluded?: string[];
}

/**
 * Optional parameters.
 */
export interface WebPubSubSendToGroup$jsonOptionalParams
  extends coreHttp.OperationOptions {
  /**
   * Excluded connection Ids
   */
  excluded?: string[];
}

/**
 * Optional parameters.
 */
export interface WebPubSubGrantPermissionOptionalParams
  extends coreHttp.OperationOptions {
  /**
   * Optional. If not set, grant the permission to all the targets. If set, grant the permission to the specific target. The meaning of the target depends on the specific permission.
   */
  targetName?: string;
}

/**
 * Optional parameters.
 */
export interface WebPubSubRevokePermissionOptionalParams
  extends coreHttp.OperationOptions {
  /**
   * Optional. If not set, revoke the permission for all targets. If set, revoke the permission for the specific target. The meaning of the target depends on the specific permission.
   */
  targetName?: string;
}

/**
 * Optional parameters.
 */
export interface WebPubSubCheckPermissionOptionalParams
  extends coreHttp.OperationOptions {
  /**
   * Optional. If not set, get the permission for all targets. If set, get the permission for the specific target. The meaning of the target depends on the specific permission.
   */
  targetName?: string;
}

/**
 * Optional parameters.
 */
export interface WebPubSubServiceClientOptionalParams
  extends coreHttp.ServiceClientOptions {
  /**
   * Api Version
   */
  apiVersion?: string;
  /**
   * Overrides client endpoint.
   */
  endpoint?: string;
}
