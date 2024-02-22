/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { WebPubSubResource } from "@azure/arm-webpubsub";
import { ResourceModel } from "../utils";


export type ServiceModel = WebPubSubResource & ResourceModel;
