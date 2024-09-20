import {
    Button,
    Card,
    CardHeader,
    CardPreview,
    Input,
    Label,
} from "@fluentui/react-components";
import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useEffect, useState, useRef } from "react";
import Editor from '@monaco-editor/react';
import { Definition, Example, Parameter } from "../../models";
import { useDataContext } from "../../providers/DataContext";
import {
    Send24Regular,
} from "@fluentui/react-icons";
import { hasJsonBody, isJsonContent } from "../../utils";
import { Icon } from "@fluentui/react";
import "./Parameters.css";

export interface ApiResponse {
    status: number;
    ok: boolean;
    body?: string;
    isJson: boolean;
}

export function Parameters({ path, parameters, example, setResponse, methodName, consumes }: {
    path: string
    parameters: Parameter[],
    example: Example,
    setResponse: React.Dispatch<React.SetStateAction<ApiResponse | undefined>>,
    methodName: string,
    consumes?: string[]
}): React.JSX.Element {
    const { data, dataFetcher } = useDataContext();
    const [urlCopied, setUrlCopied] = useState<boolean>(false);
    const [tokenCopied, setTokenCopied] = useState<boolean>(false);
    const [url, setUrl] = useState<string>("");
    const [token, setToken] = useState("");
    const [tokenVisible, setTokenVisible] = useState(false);
    const [model, setModel] = useState<TryItModel>({ hasParameter: false });
    const [invokeDisabled, setInvokeDisabled] = useState(true);
    const [invoking, setInvoking] = useState(false);
    // special logic for health check api
    const needAuth = !path.endsWith("/api/health");
    const [contentType, setContentType] = React.useState<string>("");
    const contentRef = useRef<HTMLDivElement | null>(null);
    const maskRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (consumes && consumes.length > 0) {
            setContentType(consumes[0]);
        } else {
            setContentType("");
        }
    }, [consumes]);

    useEffect(() => {
        setModel(getTryItModel(parameters, example));
    }, [parameters, example]);

    useEffect(() => {
        let newPath = path;
        if (data.hub) {
            newPath = newPath.replace('{hub}', data.hub);
        }
        let query: string = "";
        if (model.path) {
            Object.entries(model.path).forEach(([k, parameter]) => {
                if (parameter.value !== undefined) {
                    newPath = newPath.replace(`{${parameter.name}}`, parameter.value);
                }
            });
        }
        if (model.query) {
            Object.entries(model.query).forEach(([k, parameter]) => {
                if (parameter.value) {
                    query += `${parameter.name}=${parameter.value}&`;
                }
            });
        }
        setUrl(`${data.endpoint.slice(0, -1)}${newPath}?${query}api-version=${data.apiSpec.info.version}`);
    }, [path, data.hub, data.endpoint, model, data.apiSpec]);

    useEffect(() => {
        async function getToken() {
            // if no server connected, typeof token if object
            const token: any = await dataFetcher.invoke("getRestApiToken", url);
            if (token) {
                setToken(token);
            } else {
                setToken("please connect to server to get the token")
            }
        }

        getToken();
    }, [url, dataFetcher]);

    useEffect(() => {
        if (model.body && model.body.required && !model.body.value) {
            console.log(model.body);
            setInvokeDisabled(true);
            return;
        }
        if (model.header) {
            let i = Object.entries(model.header).find(([k, i]) => i.required && !i.value);
            if (i && i.length > 0) {
                console.log(i);
                setInvokeDisabled(true);
                return;
            }
        }
        if (model.path) {
            let i = Object.entries(model.path).find(([k, i]) => i.required && !i.value);
            if (i && i.length > 0) {
                console.log(i);
                setInvokeDisabled(true);
                return;
            }
        }
        if (model.query) {
            let i = Object.entries(model.query).find(([k, i]) => i.required && !i.value);
            if (i && i.length > 0) {
                console.log(i);
                setInvokeDisabled(true);
                return;
            }
        }
        setInvokeDisabled(false);
    }, [model]);

    const updateMaskSize = () => {
        if (contentRef.current && maskRef.current) {
            const { width, height, top, left } = contentRef.current.getBoundingClientRect();

            maskRef.current.style.width = `${width}px`;
            maskRef.current.style.height = `${height}px`;
            maskRef.current.style.top = `${top}px`;
            maskRef.current.style.left = `${left}px`;
        }
    };

    useEffect(() => {
        if (invoking) {
            updateMaskSize();
        }
    }, [invoking]);

    function copyUrl(): void {
        navigator.clipboard.writeText(url || "")
            .then(() => {
                setUrlCopied(true);
                setTimeout(() => {
                    setUrlCopied(false);
                }, 3000)
            }).catch(err => console.error("Failed to copy url: ", err));
    }

    function copyHeaderToken(): void {
        navigator.clipboard.writeText(token || "")
            .then(() => {
                setTokenCopied(true);
                setTimeout(() => {
                    setTokenCopied(false);
                }, 3000)
            }).catch(err => console.error("Failed to copy token: ", err));
    }

    function onSetValue(param: TryItParameterModel, value: any, type: "path" | "query" | "body"): void {
        if (type === "body") {
            setModel(prev => ({
                ...prev, body: { ...param, value: value }
            }));
        } else {
            setModel(prev => ({
                ...prev,
                [type]: {
                    ...prev[type],
                    [param.name]: { ...param, value: value },
                }
            }));
        }
    }

    async function sendRequest(methodName: string, model: TryItModel, needAuth: boolean, contentType?: string): Promise<void> {
        setInvoking(true);
        let headers: HeadersInit = {};
        if (contentType) {
            headers["Content-Type"] = contentType;
        }
        if (needAuth) {
            const token: string = await dataFetcher.invoke("getRestApiToken", url);
            headers["Authorization"] = `Bearer ${token}`;
        }
        fetch(url, {
            method: methodName,
            headers: headers,
            body: model.body?.value
        }).then(async response => {
            let res: ApiResponse = {
                ok: response.ok,
                status: response.status,
                isJson: hasJsonBody(response.headers, methodName)
            }
            if (response.body !== null) {
                // always use text to read
                const body = await response.text();
                if (body.length > 0) {
                    res.body = body;
                }
            }
            setResponse(res);
        }).finally(() => {
            setInvoking(false);
        });
    }

    return <div className="d-flex align-items-stretch">
        <div hidden={!invoking} className="loading-mask" id="loadingMask" ref={maskRef}></div>
        <Card className="m-2" style={{ flex: 1 }} ref={contentRef}>
            <CardHeader header={<b className="fs-6">Try It</b>} />
            <CardPreview className="d-flex flex-column align-items-start p-3">
                <div className="d-flex justify-content-between w-100">
                    <Label>HTTP URL</Label>
                </div>
                <Input className="d-inline-flex" readOnly={true}
                    contentAfter={<Icon iconName={urlCopied ? "checkmark" : "copy"} style={{ cursor: "pointer" }}
                        onClick={copyUrl} />}
                    value={url} />
                {(needAuth || consumes) && <><b>Headers</b>
                    {needAuth && <><div className="d-flex justify-content-between w-100">
                        <Label>Authorization</Label>
                    </div>
                        <Input className="d-inline-flex" readOnly={true}
                            contentAfter={<Icon iconName={tokenCopied ? "checkmark" : "copy"} style={{ cursor: "pointer" }}
                                onClick={copyHeaderToken} />}
                            value={token} type={tokenVisible ? "text" : "password"}
                            onClick={() => setTokenVisible(!tokenVisible)} /></>}
                    {consumes && consumes.length > 0 && <div className="form-group">
                        <div className="d-flex justify-content-between w-100">
                            <Label>Content-Type</Label>
                        </div>
                        <select className="form-select"
                            style={{ boxShadow: "none", outline: "none" }}
                            aria-labelledby="ct1"
                            value={contentType}
                            onChange={(ev) => {
                                setContentType(ev.target.value); // handle the selected value
                            }}>
                            {consumes.map((option) => (
                                <option key={option} >
                                    {option}
                                </option>
                            ))}
                        </select>
                    </div>}
                </>}
                {model.hasParameter && <><b>Parameters</b>
                    {model.path && Object.entries(model.path).map(([key, parameter], index) => (
                        <ParameterInput key={parameter.name} parameter={parameter} type="path" onChange={onSetValue}></ParameterInput>
                    ))}
                    {model.query && Object.entries(model.query).map(([key, parameter], index) => (
                        <ParameterInput key={parameter.name} parameter={parameter} type="query" onChange={onSetValue}></ParameterInput>
                    ))}
                </>}

                {model.body && <ParameterInput key={model.body.name} parameter={model.body} type="body" onChange={onSetValue} contentType={contentType}></ParameterInput>}
                <div className="m-2 d-flex justify-content-end ">
                    <Button icon={<Send24Regular />} disabled={invokeDisabled} onClick={() => sendRequest(methodName, model, needAuth, contentType)}>Invoke</Button>
                </div>
            </CardPreview>
        </Card>
    </div>
}

interface TryItModel {
    body?: TryItParameterModel,
    path?: Record<string, TryItParameterModel>,
    query?: Record<string, TryItParameterModel>,
    header?: Record<string, TryItParameterModel>,
    hasParameter: boolean
}
interface TryItParameterModel {
    parameterDefinition: Parameter,
    value: any,
    name: string,
    type: string,
    description?: string,
    required: boolean,
    schema?: Definition,
    consumes?: string[]
}

function isKnownParameter(element: Parameter): boolean {
    return element.name === "api-version" || element.name === "hub"
}

function getTryItModel(parameter: Parameter[], example: Example): TryItModel {
    let m: TryItModel = { hasParameter: false };
    parameter.forEach(element => {
        const i = { value: element.default ?? "", type: element.type ?? "object", required: element.required ?? false, name: element.name, description: element.description, parameterDefinition: element };
        if (element.in === "body" || element.in === "formData") {
            m.body = i;
            if (!i.value && example) {
                // find the example data
                const exampleData = example.parameters[i.name];
                if (exampleData) {
                    i.value = JSON.stringify(exampleData, null, 2);
                }
            }
        } else if (element.in === "path") {
            if (!isKnownParameter(element)) {
                // these 2 are known parameters
                m.path ??= {};
                m.path[element.name] = i;
                m.hasParameter = true;
                // do not load example data for path
            }
        } else if (element.in === "query") {
            if (!isKnownParameter(element)) {
                m.query ??= {};
                m.query[element.name] = i;
                m.hasParameter = true;
                // do not load example data for query
            }
        } else if (element.in === "header") {
            throw new Error("Header parameters are not yet supported");
        }
    });
    console.log(m);
    return m;
}

function ParameterInput({ parameter, type, onChange, contentType }: { parameter: TryItParameterModel, type: "path" | "query" | "body", onChange: (param: TryItParameterModel, value: any, type: "path" | "query" | "body") => void, contentType?: string }) {
    const language = isJsonContent(contentType) ? "json" : undefined;
    if (type !== "body")
        return <>
            <div className="d-flex">
                <Label className="me-2" required={parameter.required}>{parameter.name}</Label>
                <Label className="text-success mx-1">{parameter.type}</Label>
            </div>
            <div className="d-flex flex-column">
                <Input value={parameter.value} onChange={e => onChange(parameter, e.target.value, type)} />
                {parameter.description && <small className={"form-text"}>{parameter.description}</small>}
            </div>
        </>;
    return <>
        <div><Label><b>Body</b></Label>
            <div className="d-flex">
                <Label className="me-2" required={parameter.required}>{parameter.name}</Label>{ }
                <Label className="text-success mx-1">{parameter.type}</Label>
            </div>
            <Editor
                height={"15vh"}
                defaultLanguage={language}
                options={
                    {
                        lineNumbers: "off",
                        folding: false,
                        minimap: {
                            enabled: false
                        }
                    }}
                value={parameter.value ?? ""}
                onChange={(value) => onChange(parameter, value, type)}
            />
        </div></>
}