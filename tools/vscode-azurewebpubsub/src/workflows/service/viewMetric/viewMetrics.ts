/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizard, createSubscriptionContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type IPickMetricsContext, type IPickServiceContext } from "src/workflows/common/contexts";
import { type ServiceItem } from "../../../tree/service/ServiceItem";
import * as utils from "../../../utils";
import { createActivityContext, localize } from "../../../utils";
import { InputAggregationTypeStep } from "./InputAggregationTypeStep";
import { InputMetricNameStep } from "./InputMetricNameStep";
import { InputTimespanStep } from "./InputTimespanStep";
import { ViewMetricStep } from "./ViewMetricsStep";
import { pickService } from "../../../tree/service/pickService";

export async function viewMetrics(context: IActionContext, node?: ServiceItem): Promise<void> {
    const { subscription, service } = node ?? await pickService(context, {
        title: localize('viewMetric', 'View Metric'),
    });

    const wizardContext: IPickMetricsContext = {
        ...context,
        ...await createActivityContext(),
        subscription: createSubscriptionContext(subscription),
        serviceName: service.name,
        resourceGroupName: service.resourceGroup
    };

    const wizard: AzureWizard<IPickServiceContext> = new AzureWizard(wizardContext, {
        title: localize('selectMetricAndAggregationType', 'Select metric and aggregation type'),
        promptSteps: [new InputTimespanStep(), new InputMetricNameStep(), new InputAggregationTypeStep()],
        executeSteps: [new ViewMetricStep()]
    });

    await wizard.prompt();
    wizardContext.activityTitle = utils.localize('viewMetric', 'View Metric of "{0}"', wizardContext.serviceName);
    await wizard.execute();
}
