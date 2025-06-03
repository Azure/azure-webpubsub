/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type IAzureUserInput } from "@microsoft/vscode-azext-utils";
import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { isUrlValid, localize } from "../../../utils";
import { type ICreateOrUpdateHubSettingContext } from "../../common/contexts";
import { ANONYMOUS_CONNECT_HELP_LINK, KnownAnonymousConnectPolicy, KnownUserEvents, eventHandlerSystemEvents, eventHandlerUserEvents } from "../../../constants";

export class CreateOrUpdateEventHandlerStep extends AzureWizardPromptStep<ICreateOrUpdateHubSettingContext> {
    public constructor(private readonly isNewHandler: boolean) { super(); }

    public async prompt(context: ICreateOrUpdateHubSettingContext): Promise<void> {
        if (!(context.hubProperties?.eventHandlers)) {
            throw new Error(localize(
                'inValidICreateOrUpdateHubSettingContext',
                'Invalid ICreateOrUpdateHubSettingContext, hubProperties = {0}',
                JSON.stringify(context.hubProperties)
            ));
        }
        
        let updateIndex = -1;
        if (!this.isNewHandler) {
            if (!(context.hubProperties?.eventHandlers?.length)) {
                throw new Error(localize('emptyEventHandler', 'The event handler list is empty.'));
            }
            const choices = context.hubProperties.eventHandlers.map((handler, index) => ({
                label: `Priority ${index + 1}: ${handler.urlTemplate}`,
                data: index,
                detail: `User Events = ${handler.userEventPattern ?? ""}\tSystem Events = ${(handler.systemEvents ?? []).join(',')}` // '\n' not work here, use '\t' instead
            }));
            updateIndex = (await context.ui.showQuickPick(choices, { placeHolder: localize('selectEventHandler', 'Select Event Handler') })).data;
            let eventHandler = context.hubProperties.eventHandlers[updateIndex];
            eventHandler = {
                ...eventHandler,
                urlTemplate: await inputUrlTemplate(context.ui, eventHandler.urlTemplate),
                userEventPattern: await inputUserEvents(context.ui),
                systemEvents: await selectSystemEvents(context.ui)
            };
            context.hubProperties.eventHandlers[updateIndex] = eventHandler;
        }
        else {
            context.hubProperties.eventHandlers.push({
                urlTemplate: await inputUrlTemplate(context.ui),
                userEventPattern: await inputUserEvents(context.ui), 
                systemEvents: await selectSystemEvents(context.ui), 
                auth: {}
            });
        }
    }

    public shouldPrompt(_context: ICreateOrUpdateHubSettingContext): boolean { return true; }
}

async function inputUrlTemplate(ui: IAzureUserInput, defaultUrlTemplate: string = "https://") {
    return await (ui.showInputBox({
        prompt: localize('enterEventHandlerUrlTemplate', 'Enter a URL Template for the event Handler.'),
        validateInput: (urlTemplate: string) => {
            return urlTemplate === defaultUrlTemplate || isUrlValid(urlTemplate)
                ? "" 
                : localize('invalidUrlTemplate', `The URL template must be a valid URL.`);
        },
        value: defaultUrlTemplate
    }));
}

export async function selectSystemEvents(ui: IAzureUserInput) {
    const candidateItems = eventHandlerSystemEvents.map((event) => ({ label: event, data: event }));
    const selectedItems = await (ui.showQuickPick(candidateItems, {
        placeHolder: localize('systemEventsPrompt', 'Select System Events'),
        canPickMany: true
    }));
    return selectedItems.map((item) => item.data);
}

export async function inputUserEvents(ui: IAzureUserInput) {
    const candidateItems = eventHandlerUserEvents.map((event) => ({ label: event, data: event }));
    const pickBox = ui.showQuickPick(candidateItems, {
        placeHolder: localize('userEventsPrompt', 'Select User Events')
    });
    const userEvent = (await pickBox).data;
    let userEventPattern: string = "";
    switch (userEvent) {
        case KnownUserEvents.All: userEventPattern = "*"; break;
        case KnownUserEvents.None: userEventPattern = ""; break;
        case KnownUserEvents.Specify:
            userEventPattern = (await ui.showInputBox({
                prompt: localize(
                    'userEventsPatternPrompt',
                    'Specifiy the user events. Gets or sets the matching pattern for event names. There are 3 kinds of patterns supported: 1. "*", it matches any event name 2. Combine multiple events with ",", for example "event1,event2", it matches event "event1" and "event2" 3. A single event name, for example, "event1", it matches "event1"'
                ),
                value: ""
            })).trim();
            break;
        default:
            throw new Error(localize("invalidUserEventType", 'Invalid User Event Type {0}', userEvent));
    }
    return userEventPattern;
}

export async function InputAnonymousPolicy(ui: IAzureUserInput): Promise<string> {
    const annoymousConnectPolicyPickItems = [ { label: "Allow", data: KnownAnonymousConnectPolicy.Allow }, { label: "Deny", data: KnownAnonymousConnectPolicy.Deny } ];
    return (await ui.showQuickPick(
        annoymousConnectPolicyPickItems,
        { 
            placeHolder: localize('selectAnonymousPolicy', 'Select if anonymous clients is allowed. Click "?" in the top right corner to learn more.'),
            learnMoreLink: ANONYMOUS_CONNECT_HELP_LINK
        }
    )).data;
}
