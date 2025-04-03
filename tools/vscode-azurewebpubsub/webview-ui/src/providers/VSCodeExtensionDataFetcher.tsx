import { ServiceConfiguration, type DataModel } from "../models";
import { vscode } from "../utilities/vscode";
import { type IDataFetcher } from "./IDataFetcher";

export class VSCodeExtensionDataFetcher implements IDataFetcher {
  public static ackId = 0;
  public model: DataModel = {
    ready: false,
    endpoint: "",
    serviceConfiguration: { loaded: false, resourceName: "" },
  };

  constructor(private onModelUpdate: (model: DataModel) => void) {
    this._updateModel();
  }

  public invoke(command: string, payload?: any): Promise<string> {
    VSCodeExtensionDataFetcher.ackId++;
    vscode.postMessage({ command: `${command}-${VSCodeExtensionDataFetcher.ackId}`, payload: payload });
    return this.readExtensionEventAsync(command, VSCodeExtensionDataFetcher.ackId);
  }

  public async fetch(): Promise<DataModel> {
    const payload = await this.invoke("reportServiceConfiguration");
    this.model = { ...this.model, serviceConfiguration: payload as unknown as ServiceConfiguration };
    return this.model;
  }

  private async readExtensionEventAsync(nativeCommand: string, ackId: number): Promise<any> {
    return new Promise<string>((resolve, reject) => {
      const eventCallback = (event: MessageEvent<any>) => {
        const message = event.data;
        console.log(`[Webview] Received message from extension: ${JSON.stringify(message)}`);

        const { payload, command } = message;

        if (command === `ack-${nativeCommand}-${ackId}`) {
          resolve(payload);
        }
      };

      window.addEventListener("message", eventCallback);
    });
  }

  private async _updateModel(): Promise<void> {
    this.model = await this.fetch();
    this.onModelUpdate(this.model);
  }
}
