import { DataModel } from './models';

export interface IDataFetcher {
  model: DataModel;
  fetch(): Promise<DataModel>;
}
