import { DataModel } from "../models";
import { MockDataFetcher } from "./MockDataFetcher";
import { SignalRDataFetcher, SocketIODataFetcher } from "./ConnectionBasedDataFether";
export interface IDataFetcher {
  model: DataModel;
}

export function getDataFetcher(onModelUpdate: (model: DataModel) => void): IDataFetcher {
  switch (process.env.REACT_APP_DATA_FETCHER) {
    case "mock":
      return new MockDataFetcher(onModelUpdate);
    case "npm":
      return new SocketIODataFetcher(onModelUpdate);
    case "dotnet":
      return new SignalRDataFetcher(onModelUpdate);
    default:
      throw Error(`Unknown data fetcher: ${process.env.REACT_APP_DATA_FETCHER}`);
  }
}
