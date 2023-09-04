// DataContext.js
import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import { MockDataFetcher } from "./MockDataFetcher";
import { IDataFetcher } from "./IDataFetcher";
import { DataModel } from "./models";
import { SignalRDataFetcher } from "./SignalRDataFetcher";

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
}

export const DataProvider: React.FC<{
  children: ReactNode;
}> = ({ children }) => {
  const dataFetcher = useMemo<IDataFetcher>(
    () => new SignalRDataFetcher((m) => setData(m)),
    []
  ) as IDataFetcher;
  const [data, setData] = useState<DataModel>(dataFetcher.model);

  return <DataContext.Provider value={{ data, setData }}>{children}</DataContext.Provider>;
};
