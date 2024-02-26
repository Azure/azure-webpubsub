import  { type IPickServiceContext } from "src/workflows/common/contexts";

export interface ICopyEndpointContext extends IPickServiceContext {
    endpoint?: string;
}
