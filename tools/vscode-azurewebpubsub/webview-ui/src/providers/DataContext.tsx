// DataContext.js
import { type ReactNode} from "react";
import React, { createContext, useContext, useState, useMemo } from "react";
import { type IDataFetcher} from "./IDataFetcher";
import { getDataFetcher } from "./IDataFetcher";
import { type DataModel } from "../models";

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useDataContext = (): DataContextType => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
};

interface DataContextType {
  data: DataModel;
  setData: React.Dispatch<React.SetStateAction<DataModel>>;
  dataFetcher: IDataFetcher;
}

export const DataProvider: React.FC<{
  children: ReactNode;
}> = ({ children }) => {
  const dataFetcher = useMemo<IDataFetcher>(() => getDataFetcher((m) => setData(m)), []) as IDataFetcher;
  const [data, setData] = useState<DataModel>(dataFetcher.model);

  return <DataContext.Provider value={{ data, setData, dataFetcher: dataFetcher }}>{children}</DataContext.Provider>;
};
