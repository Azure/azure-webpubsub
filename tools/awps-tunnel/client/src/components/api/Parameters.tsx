import {
    Button,
    Card,
    CardHeader,
    CardPreview,
    Input,
    Label,
    Table,
    TableBody,
    TableCell,
    TableHeader,
    TableHeaderCell,
    TableRow
} from "@fluentui/react-components";
import { Icon } from '@fluentui/react/lib/Icon';
import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useEffect, useState } from "react";
import Editor from '@monaco-editor/react';
import { APIResponse, Definition, ExampleParameter, Parameter } from "../../models";
import { useDataContext } from "../../providers/DataContext";
import {
    Send24Regular,
} from "@fluentui/react-icons";

export function Parameters({ path, parameters, example, setResponse, methodName }: {
    path: string
    parameters: Parameter[],
    example: ExampleParameter,
    setResponse: React.Dispatch<React.SetStateAction<APIResponse | undefined>>,
    methodName: string
}): React.JSX.Element {
    return (
        <div className="d-flex">
            <TryIt methodName={methodName} path={path} parameters={parameters} example={example} setResponse={setResponse} ></TryIt>
        </div>
    )
}

function Schema({ parameters, bodySchema }: { parameters: Parameter[], bodySchema: Definition | undefined }): React.JSX.Element {
    return <div style={{ flex: 1 }}>
        <Card className="m-2 w-95">
            <CardHeader header={<b className="fs-6">Parameter Schema</b>} />
            <CardPreview className="d-flex flex-column align-items-start p-3">
                <><Label><b className="fs-6">Query</b></Label>
                    <Table className="mb-2">
                        <TableHeader>
                            <TableRow>
                                <TableHeaderCell>name</TableHeaderCell>
                                <TableHeaderCell>type</TableHeaderCell>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {parameters.map((p, index) => (
                                <TableRow key={index}>
                                    <TableCell>
                                        <div>
                                            <div>
                                                {p.name}
                                            </div>
                                            {p.required && <div className="text-danger">required</div>}
                                        </div>
                                    </TableCell>
                                    <TableCell>{p.type}</TableCell>
                                </TableRow>
                            )
                            )}
                        </TableBody>
                    </Table></>
                {bodySchema && <><Label><b className="fs-6">Body</b></Label>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHeaderCell>name</TableHeaderCell>
                                <TableHeaderCell>type</TableHeaderCell>
                                <TableHeaderCell>items type</TableHeaderCell>
                            </TableRow>
                        </TableHeader>
                        {bodySchema.name ?
                            <TableBody>
                                <TableRow>
                                    <TableCell>{bodySchema.name}</TableCell>
                                    <TableCell>{bodySchema.type}</TableCell>
                                </TableRow>
                            </TableBody> :
                            <TableBody>
                                {bodySchema.properties && Object.entries(bodySchema.properties).map(([name, item], index) => (
                                    <TableRow key={index}>
                                        <TableCell>{name}</TableCell>
                                        <TableCell>{item.type}</TableCell>
                                        {item.items && <TableCell>{item.items.type}</TableCell>}
                                    </TableRow>
                                ))}
                            </TableBody>}
                    </Table></>}
            </CardPreview>
        </Card>
    </div>;
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
    description?: string,
    required: boolean
}

function isKnownParameter(element: Parameter): boolean {
    return element.name === "api-version" || element.name === "hub"
}

function getTryItModel(parameter: Parameter[]): TryItModel {
    let m: TryItModel = { hasParameter: false };
    parameter.forEach(element => {
        const i = { value: element.default, required: element.required ?? false, name: element.name, description: element.description, parameterDefinition: element };
        if (element.in === "body" || element.in === "formData") {
            m.body = i;
        } else if (element.in === "path") {
            if (!isKnownParameter(element)) {
                // these 2 are known parameters
                m.path ??= {};
                m.path[element.name] = i;
                m.hasParameter = true;
            }
        } else if (element.in === "query") {
            if (!isKnownParameter(element)) {
                m.query ??= {};
                m.query[element.name] = i;
                m.hasParameter = true;
            }
        } else if (element.in === "header") {
            throw new Error("Header parameters are not yet supported");
        }
    });
    console.log(m)
    return m;
}

function TryIt({ path, parameters, example, setResponse, methodName }: {
    path: string
    parameters: Parameter[],
    example: ExampleParameter,
    setResponse: React.Dispatch<React.SetStateAction<APIResponse | undefined>>,
    methodName: string
}): React.JSX.Element {
    const { data, dataFetcher } = useDataContext();
    const [urlCopied, setUrlCopied] = useState<boolean>(false);
    const [tokenCopied, setTokenCopied] = useState<boolean>(false);
    const [url, setUrl] = useState<string>("");
    const [token, setToken] = useState("");
    const [tokenVisible, setTokenVisible] = useState(false);
    const [model, setModel] = useState(getTryItModel(parameters));
    const [invokeDisabled, setInvokeDisabled] = useState(true);

    // special logic for health check api
    const needAuth = !path.endsWith("/api/health");
    const contentType = parameters.find((i) => i.in === "body") ? "application/json" : undefined;

    useEffect(() => {
        setModel(getTryItModel(parameters));
    }, [parameters]);
    useEffect(() => {
        // todo: make it a general logic instead of hardcode
        setModel(prev => {
            if (!prev.body) return prev;
            const body = (example.groupsToAdd || example.groupsToRemove || example.message) ? (example.groupsToAdd || example.groupsToRemove || { message: example.message }) : undefined;
            return ({
                ...prev,
                body: { ...prev.body, value: body },
            });
        });

    }, [parameters, example]);

    useEffect(() => {
        let newPath = path;
        if (data.hub) {
            newPath = newPath.replace('{hub}', data.hub);
        }
        let query: string = "";
        if (model.path) {
            Object.entries(model.path).forEach(([k, parameter]) => {
                newPath = newPath.replace(`{${parameter.name}}`, parameter.value);
            });
        }
        if (model.query) {
            Object.entries(model.query).forEach(([k, parameter]) => {
                if (parameter.value !== undefined) {
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
                [param.name]: { ...param, value: value },
            }));
        }
    }

    function hasJsonBody(methodName: string, header: Headers): boolean {
        if (methodName === "head") {
            return false;
        }
        const contentType = header.get("Content-Type");
        if (!contentType) {
            return false;
        }
        return contentType.includes("application/json") || contentType.includes("text/json") || contentType.includes("application/problem+json");
    }

    async function sendRequest(methodName: string, model: TryItModel, needAuth: boolean, contentType?: string): Promise<void> {
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
        }).then(res => {
            if (hasJsonBody(methodName, res.headers)) {
                return res.json();
            } else {
                return res; // super tricky, should improve
            }
        })
            .then(res => { setResponse(res as APIResponse); });
    }

    return <div style={{ flex: 3 }}>
        <Card className="w-95 m-2">
            <CardHeader header={<b className="fs-6">Try It</b>} />
            <CardPreview className="d-flex flex-column align-items-start p-3">
                <div className="d-flex justify-content-between w-100">
                    <Label>HTTP URL</Label>
                </div>
                <Input className="d-inline-flex" readOnly={true}
                    contentAfter={<Icon iconName={urlCopied ? "checkmark" : "copy"} style={{ cursor: "pointer" }}
                        onClick={copyUrl} />}
                    value={url} />
                <div><Label><b>Headers</b></Label></div>
                {needAuth && <><div className="d-flex justify-content-between w-100">
                    <Label>Authorization</Label>
                </div>
                    <Input className="d-inline-flex" readOnly={true}
                        contentAfter={<Icon iconName={tokenCopied ? "checkmark" : "copy"} style={{ cursor: "pointer" }}
                            onClick={copyHeaderToken} />}
                        value={token} type={tokenVisible ? "text" : "password"}
                        onClick={() => setTokenVisible(!tokenVisible)} /></>}
                {model.hasParameter && <><Label><b>Parameters</b></Label>
                    {model.path && Object.entries(model.path).map(([key, parameter], index) => (
                        <ParameterInput key={key} parameter={parameter} type="path" onChange={onSetValue}></ParameterInput>
                    ))}
                    {model.query && Object.entries(model.query).map(([key, parameter], index) => (
                        <ParameterInput key={key} parameter={parameter} type="query" onChange={onSetValue}></ParameterInput>
                    ))}
                </>}

                {model.body && <ParameterInput parameter={model.body} type="body" onChange={onSetValue}></ParameterInput>}
                <div className="m-2 d-flex justify-content-end ">
                    <Button icon={<Send24Regular />} disabled={invokeDisabled} onClick={() => sendRequest(methodName, model, needAuth, contentType)}>Invoke</Button>
                </div>
            </CardPreview>
        </Card>
    </div>

}

function ParameterInput({ parameter, type, onChange }: { parameter: TryItParameterModel, type: "path" | "query" | "body", onChange: (param: TryItParameterModel, value: any, type: "path" | "query" | "body") => void }) {
    if (type !== "body")
        return <>
            <div className="d-flex">
                <Label className="me-2">{parameter.name}</Label>
                {parameter.required && <Label className="text-danger">required</Label>}
            </div>
            <div className="d-flex flex-column">
                <Input value={parameter.value} onChange={e => onChange(parameter, e.target.value, type)} />
                {parameter.description && <small className={"form-text"}>{parameter.description}</small>}
            </div>
        </>;
    return <>
        <div><Label><b>Body</b></Label>
            <div className="d-flex">
                <Label className="me-2">{parameter.name}</Label>{ }
                {parameter.required && <Label className="text-danger">required</Label>}
            </div>
            <Editor
                height={"15vh"}
                defaultLanguage="json"
                options={
                    {
                        lineNumbers: "off",
                        folding: false,
                        minimap: {
                            enabled: false
                        }
                    }}
                value={parameter.value ? JSON.stringify(parameter.value, null, 2) : ""}
                onChange={(value) => onChange(parameter, tryGetJsonValue(value), type)}
            />
        </div></>
}

function tryGetJsonValue(value: string | undefined) {
    if (!value) return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}