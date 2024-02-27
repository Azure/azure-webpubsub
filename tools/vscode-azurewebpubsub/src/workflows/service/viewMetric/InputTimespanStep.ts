import  { type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../utils";
import  { type IPickMetricsContext } from "../../common/contexts";
import { DAY_MILLISECONDS, HOUR_MILLISECONDS } from "../../../constants";

const CUSTOM_TIME_RANGE_FLAG = -1;

const timespanPickItems: IAzureQuickPickItem<number>[] = [
    { label: "Last Hour", data: HOUR_MILLISECONDS },
    { label: "Last 24 Hour", data: 24 * HOUR_MILLISECONDS },
    { label: "Last 7 Day", data: 7 * DAY_MILLISECONDS },
    { label: "Custom Time Range", data: CUSTOM_TIME_RANGE_FLAG },
];

export class InputTimespanStep extends AzureWizardPromptStep<IPickMetricsContext> {
    public async prompt(context: IPickMetricsContext): Promise<void> {
        const chosenTimespan = await context.ui.showQuickPick(timespanPickItems, { placeHolder: localize("selectTimeSpan", "Select Customized Time Span")});

        if (chosenTimespan.data !== CUSTOM_TIME_RANGE_FLAG) {
            context.endTime = new Date();
            context.startTime = new Date(context.endTime.getTime() - chosenTimespan.data);
        }
        else {
            const startTime = await context.ui.showInputBox({
                placeHolder: "Start Time (Local Time)",
                value: InputTimespanStep.formatDate(new Date()),
                prompt: "Input the start time. Format: yyyy-MM-dd HH:mm:ss. Example: 2024-01-01 00:00:00",
                validateInput: InputTimespanStep.validateDateString,
            });
            context.startTime = new Date(startTime);

            const endTime = await context.ui.showInputBox({
                placeHolder: "End Time",
                value: InputTimespanStep.formatDate(new Date(context.startTime.getTime() - 1 * HOUR_MILLISECONDS)),
                prompt: "Input the end time. Format: yyyy-MM-dd HH:mm:ss. Example: 2024-01-02 00:00:00",
                validateInput: InputTimespanStep.validateDateString,
            });
            context.endTime = new Date(endTime);
        }
    }

    public shouldPrompt = (_context: IPickMetricsContext): boolean => true;

    static validateDateString = (date: string): string | undefined => isNaN(new Date(date).getTime()) ? "Invalid date format" : undefined;

    // output format: 2024-01-01 00:00:00
    static formatDate = (date: Date): string => date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
}
