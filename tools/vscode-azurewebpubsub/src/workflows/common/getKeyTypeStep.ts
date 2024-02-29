import  { type KeyType} from "@azure/arm-webpubsub";
import { KnownKeyType } from "@azure/arm-webpubsub";
import  { type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { localize } from "../../utils";
import  { type IPickKeyContext } from "./contexts";

const keyTypePickItems: IAzureQuickPickItem<KeyType>[] = [
    { label: "Primary", data: KnownKeyType.Primary },
    { label: "Secondary", data: KnownKeyType.Secondary },
];

export class GetKeyTypeStep extends AzureWizardPromptStep<IPickKeyContext> {
    public async prompt(context: IPickKeyContext): Promise<void> {
        const chosenItem = await context.ui.showQuickPick(keyTypePickItems, {
            placeHolder: localize("key", `Select key type`),
            suppressPersistence: true,
        });
        const keyType = chosenItem.data;
        context.keyType = keyType;
    }

    public shouldPrompt(_context: IPickKeyContext): boolean { return true; }
}
