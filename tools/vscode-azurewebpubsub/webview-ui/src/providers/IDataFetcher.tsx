import { type DataModel } from "../models";
import { VSCodeExtensionDataFetcher } from "./VSCodeExtensionDataFetcher";

export interface IDataFetcher {
  model: DataModel;
  invoke: (method: string, ...args: any[]) => Promise<any>;
}

export function getDataFetcher(onModelUpdate: (model: DataModel) => void): IDataFetcher {
  return new VSCodeExtensionDataFetcher(onModelUpdate);
}
