import { DataModel } from "../models";
import { MockDataFetcher } from "./MockDataFetcher";
import { ManualDataFetcher } from "./ManualDataFetcher";
import { SocketIODataFetcher } from "./ConnectionBasedDataFether";
export interface IDataFetcher {
  model: DataModel;
  kind: "mock" | "socket" | "manual";
  invoke: (method: string, ...args: any[]) => Promise<any>;
}

export function getDataFetcher(onModelUpdate: (model: DataModel) => void): IDataFetcher {
  switch (import.meta.env.VITE_DATA_FETCHER) {
    case "mock":
      return new MockDataFetcher(onModelUpdate);
    case "manual":
      return new ManualDataFetcher(onModelUpdate);
    case "npm":
      return new SocketIODataFetcher(onModelUpdate);
    default:
      throw Error(`Unknown data fetcher: ${import.meta.env.VITE_DATA_FETCHER}`);
  }
}
