/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type WebPubSubResource } from "@azure/arm-webpubsub";
import { type ResourceModel } from "../utils";

export type ServiceModel = WebPubSubResource & ResourceModel;
