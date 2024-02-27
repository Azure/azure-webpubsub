/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import  { type AggregationType } from "@azure/arm-monitor";
import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import  { type IPickMetricsContext, type MetricName } from "src/workflows/common/contexts";
import * as vscode from "vscode";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../utils";
import { METRIC_AGGREGATION_TYPE_TO_TYPE_ID } from "../../../constants";

const getMetricsDisplayName = (metricName: MetricName) => metricName.replace(/(?<!^)([A-Z])/g, ' $1'); // Example: "ServerLoad" -> "Server Load"

const getChartDefinitionContext = (resourceName: string, resourceId: string, metricName: MetricName, aggregationType: AggregationType) => {
    const metricDisplayName = getMetricsDisplayName(metricName);
    const chartTitle = `${aggregationType} ${metricDisplayName} for ${resourceName}`;
    const aggregationTypeId: number = METRIC_AGGREGATION_TYPE_TO_TYPE_ID[aggregationType];
    return {
        "v2charts": [{
            "metrics": [
                {
                    "resourceMetadata": {
                        "id": resourceId,
                    },
                    "name": metricName,
                    "aggregationType": aggregationTypeId,
                    "namespace": "microsoft.signalrservice/webpubsub",
                    "metricVisualization": { "displayName": metricDisplayName },
                }
            ],
            "title": chartTitle,
            "titleKind": 1,
            "visualization": {
                "chartType": 2,
                "legendVisualization": {
                    "isVisible": true,
                    "position": 2,
                    "hideSubtitle": false
                },
                "axisVisualization": {
                    "x": { "isVisible": true, "axisType": 2 },
                    "y": { "isVisible": true, "axisType": 1 }
                }
            }
        }
        ]
    }
}

const getMetricPortalUrl = (resourceName: string, resourceId: string, startTime: Date, endTime: Date, metricName: MetricName, aggregationType: AggregationType) => {
    // Example: {"absolute":{"startTime":"2024-01-29T14:07:20.011Z","endTime":"2024-01-30T03:16:45.931Z"},"showUTCTime":false,"grain":1}
    const timeContext = { "absolute": { "startTime": startTime.toISOString(), "endTime": endTime.toISOString() }, "showUTCTime": false, "grain": 1 };
    const chartDefinitionContext = getChartDefinitionContext(resourceName, resourceId, metricName, aggregationType);
    let url = "https://ms.portal.azure.com/#@microsoft.onmicrosoft.com/blade/Microsoft_Azure_MonitoringMetrics/Metrics.ReactView/Referer/MetricsExplorer/ResourceId/";
    url += encodeURIComponent(resourceId);
    url += `/TimeContext/${encodeURIComponent(JSON.stringify(timeContext))}`;
    url += `/ChartDefinition/${encodeURIComponent(JSON.stringify(chartDefinitionContext))}`;
    return url;
}

export class ViewMetricStep extends AzureWizardExecuteStep<IPickMetricsContext> {
    public priority: number = 110;

    public async execute(context: IPickMetricsContext, progress: vscode.Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('takeSeveralSeconds', 'This may take several seconds...') });

        if (!context.serviceName|| !context.resourceGroupName || !context.aggregationType || !context.metricName || !context.startTime || !context.endTime) {
            throw new Error(localize(
                'InvalidIPickMetricsContext',
                'Invalid IPickMetricsContext, serviceName: {0}, resourceGroupName: {1}, aggregationType: {2}, metricName: {3}, startTime: {4}, endTime: {5}',
                context.serviceName, context.resourceGroupName, context.aggregationType, context.metricName, context.startTime?.toString(), context.endTime?.toString()
            ));
        }
        const resourceId = `/subscriptions/${context.subscription?.subscriptionPath}/resourceGroups/${context.resourceGroupName}/providers/Microsoft.SignalRService/WebPubSub/${context.serviceName}`;
        const metricsProtalUri = getMetricPortalUrl(context.serviceName, resourceId, context.startTime, context.endTime, context.metricName, context.aggregationType);
        // Ref: https://github.com/microsoft/vscode/issues/135949#issuecomment-989333270
        /* eslint-disable */
        await vscode.env.openExternal(metricsProtalUri as any);
        /* eslint-enable */
        ext.outputChannel.appendLog(`Copied connection of "${context.serviceName}" in resource group "${context.resourceGroupName}" to clipboard.`);
    }

    public shouldExecute = (_context: IPickMetricsContext):boolean => true;
}
