import { type IPickServiceContext } from "src/workflows/common/contexts";

export interface ICheckHealthContext extends IPickServiceContext {
    endpoint?: string;
}
