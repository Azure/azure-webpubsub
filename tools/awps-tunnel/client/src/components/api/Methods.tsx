import { Label } from "@fluentui/react-components";
import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useEffect, useState } from "react";
import { APIResponse, Example, Operation } from "../../models";
import { Parameters } from "./Parameters";
import { Response } from "./Response";

export const methodColors: { [method: string]: string } = {
    post: "#ffd02b",
    put: "#4385d9",
    delete: "#f27263",
    head: "#a887c9"
};

export function Method({ method, path, methodName }: {
    method: Operation,
    path: string,
    methodName: string
}): React.JSX.Element {
    const [example, setExample] = useState<Example>();
    const [response, setResponse] = useState<APIResponse | undefined>(undefined);
    useEffect(() => {
        if (method.operationId) {
            const operationId = method.operationId;
            const example = method["x-ms-examples"][operationId].$ref;
            fetch(`./api/${process.env.REACT_APP_API_VERSION}/${example}`).then(res => res.json()).then(res => setExample(res))
            setResponse(undefined);
        }
    }, [method, path]);

    return (
        <div className="overflow-auto d-flex flex-column">
            <Label className="fs-4 fw-bold m-2">{method.summary}</Label>

            <div className="d-flex justify-content-start align-items-center m-2">
                <div className={"g-primary text-white rounded px-1 fs-6"} style={{ backgroundColor: methodColors[methodName] }}>{methodName.toUpperCase()}
                </div>
                <div className="mx-2">{path}</div>
            </div>
            <div className="overflow-auto d-flex flex-column">
                {method.parameters && example &&
                    <Parameters path={path} parameters={method.parameters} example={example.parameters}
                        setResponse={setResponse} methodName={methodName} />}
                <Response responseSchema={method.responses} response={response} />
            </div>
        </div>
    )
}
