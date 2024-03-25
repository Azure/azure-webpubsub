import { type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../utils";
import { type IPickMetricsContext, type MetricName } from "../../common/contexts";
import { KnownMetricNameEnum } from "../../common/contexts";

const metricNamePickItems: IAzureQuickPickItem<MetricName>[] = [
    { label: "Server Load", data: KnownMetricNameEnum.ServerLoad },
    { label: "Inbound Traffic", data: KnownMetricNameEnum.InboundTraffic },
    { label: "Outbound Traffic", data: KnownMetricNameEnum.OutboundTraffic },
    { label: "Connection Quota Utilization", data: KnownMetricNameEnum.ConnectionQuotaUtilization },
    { label: "Connection Count", data: KnownMetricNameEnum.ConnectionCount },
    { label: "Connection Open Count", data: KnownMetricNameEnum.ConnectionOpenCount },
    { label: "Connection Close Count", data: KnownMetricNameEnum.ConnectionCloseCount },
];

export class InputMetricNameStep extends AzureWizardPromptStep<IPickMetricsContext> {
    public async prompt(context: IPickMetricsContext): Promise<void> {
        context.metricName = (await context.ui.showQuickPick(
            metricNamePickItems, 
            { placeHolder: localize("selectMetricName", "Select Metric Name")})
        ).data;
    }

    public shouldPrompt(_context: IPickMetricsContext): boolean { return true; }
}
