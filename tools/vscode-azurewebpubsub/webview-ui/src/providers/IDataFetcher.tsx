import { DataModel } from "../models";
import { MockDataFetcher } from "./MockDataFetcher";
import { SocketIODataFetcher } from "./ConnectionBasedDataFether";
import { VSCodeBasedDataFetcher } from "./VSCodeDataFetcher";
export interface IDataFetcher {
  model: DataModel;
  invoke: (method: string, ...args: any[]) => Promise<any>;
}

export function getDataFetcher(onModelUpdate: (model: DataModel) => void): IDataFetcher {
  var fetcher = "vscode"; // process.env.REACT_APP_DATA_FETCHER;
  switch (fetcher) {
    case "vscode":
      return new VSCodeBasedDataFetcher(onModelUpdate);
    case "mock":
      return new MockDataFetcher(onModelUpdate);
    case "npm":
      return new SocketIODataFetcher(onModelUpdate);
    default:
      throw Error(`Unknown data fetcher: ${process.env.REACT_APP_DATA_FETCHER}`);
  }
}
