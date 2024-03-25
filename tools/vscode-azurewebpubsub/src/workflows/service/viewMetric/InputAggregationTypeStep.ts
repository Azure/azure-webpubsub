import { type AggregationType} from "@azure/arm-monitor";
import { KnownAggregationTypeEnum } from "@azure/arm-monitor";
import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../utils";
import { type IPickMetricsContext, type MetricName } from "../../common/contexts";
import { KnownMetricNameEnum } from "../../common/contexts";

const METRICS_NAME_TO_AGGREGATION_TYPES: { [key: MetricName]: AggregationType[] } = {
    [KnownMetricNameEnum.ServerLoad]: [KnownAggregationTypeEnum.Minimum, KnownAggregationTypeEnum.Maximum, KnownAggregationTypeEnum.Average],
    [KnownMetricNameEnum.ConnectionQuotaUtilization]: [KnownAggregationTypeEnum.Minimum, KnownAggregationTypeEnum.Maximum, KnownAggregationTypeEnum.Average],
    [KnownMetricNameEnum.ConnectionOpenCount]: [KnownAggregationTypeEnum.Total],
    [KnownMetricNameEnum.ConnectionCloseCount]: [KnownAggregationTypeEnum.Total],
    [KnownMetricNameEnum.InboundTraffic]: [KnownAggregationTypeEnum.Total],
    [KnownMetricNameEnum.OutboundTraffic]: [KnownAggregationTypeEnum.Total],
    [KnownMetricNameEnum.ConnectionCount]: [KnownAggregationTypeEnum.Maximum, KnownAggregationTypeEnum.Average],
};

export class InputAggregationTypeStep extends AzureWizardPromptStep<IPickMetricsContext> {
    public async prompt(context: IPickMetricsContext): Promise<void> {
        if (!context.metricName) {
            throw new Error(localize("InvalidIPickMetricsContext", "Invalid IPickMetricsContext, metricsName {0}", context.metricName));
        }
        const candidateAggregationTypes = METRICS_NAME_TO_AGGREGATION_TYPES[context.metricName];
        const candidateItems = candidateAggregationTypes.map(aggregationType => { return { label: aggregationType, data: aggregationType }} );
        context.aggregationType = (await context.ui.showQuickPick(
            candidateItems, 
            { placeHolder: localize("selectAggregationType", "Select Aggregation Type") })
        ).data;
    }

    public shouldPrompt = (_context: IPickMetricsContext): boolean => true;
}
