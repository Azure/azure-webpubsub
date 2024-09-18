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

function renderSchema(parameters: Parameter[]): React.JSX.Element {
    return (<div>
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
        </Table>
    </div>)
}

function renderBodySchema(schema: Definition): React.JSX.Element {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHeaderCell>name</TableHeaderCell>
                    <TableHeaderCell>type</TableHeaderCell>
                    <TableHeaderCell>items type</TableHeaderCell>
                </TableRow>
            </TableHeader>
            {schema.name ?
                <TableBody>
                    <TableRow>
                        <TableCell>{schema.name}</TableCell>
                        <TableCell>{schema.type}</TableCell>
                    </TableRow>
                </TableBody> :
                <TableBody>
                    {schema.properties && Object.entries(schema.properties).map(([name, item], index) => (
                        <TableRow key={index}>
                            <TableCell>{name}</TableCell>
                            <TableCell>{item.type}</TableCell>
                            {item.items && <TableCell>{item.items.type}</TableCell>}
                        </TableRow>
                    ))}
                </TableBody>}
        </Table>
    )
}

export function Parameters({ path, parameters, example, setResponse, methodName }: {
    path: string
    parameters: Parameter[],
    example: ExampleParameter,
    setResponse: React.Dispatch<React.SetStateAction<APIResponse | undefined>>,
    methodName: string
}): React.JSX.Element {
    const { data, dataFetcher } = useDataContext();
    const [token, setToken] = useState("");
    const [tokenVisible, setTokenVisible] = useState(false);
    const [requestParameters, setRequestParameters] = useState<{
        parameter: Parameter,
        inputComponent: React.JSX.Element
    }[]>([])
    const [requestBody, setRequestBody] = useState<Parameter[]>([]);
    const [urlCopied, setUrlCopied] = useState<boolean>(false);
    const [tokenCopied, setTokenCopied] = useState<boolean>(false);
    const [bodySchema, setBodySchema] = useState<Definition>();
    const [url, setUrl] = useState<string>("");
    const [requestParameterInputs, setRequestParameterInputs] = useState<{ [name: string]: string }>({});
    const [bodyParameterInputs, setBodyParameterInputs] = useState<string | undefined>("");

    function handleParameterOnChange(e: React.ChangeEvent<HTMLInputElement>, name: string): void {
        setRequestParameterInputs(prev => ({
            ...prev, [name]: e.target.value
        }))
    }

    useEffect(() => {
        let temp_parameter_input: { [name: string]: string } = {}
        parameters.filter(p => p.in === "query" || p.in === "path").forEach((p) => {
            if (p.name !== "api-version" && p.name !== "hub") {
                temp_parameter_input[p.name] = ""
            }
        })
        setRequestParameterInputs(temp_parameter_input);
        // todo: make it a general logic instead of hardcode
        if (example.groupsToAdd || example.groupsToRemove || example.message) {
            setBodyParameterInputs(JSON.stringify(example.groupsToAdd || example.groupsToRemove || { message: example.message }, null, 2));
        }

    }, [parameters, example]);

    useEffect(() => {
        let temp_parameter: { parameter: Parameter, inputComponent: React.JSX.Element }[] = [];
        parameters.filter(p => p.in === "query" || p.in === "path").forEach((p) => {
            temp_parameter.push({
                parameter: p,
                inputComponent: <Input value={requestParameterInputs[p.name] || ""}
                    onChange={e => handleParameterOnChange(e, p.name)} />
            })
        })
        setRequestParameters(temp_parameter);
        setRequestBody(parameters.filter(p => p.in === "body"));
    }, [parameters, requestParameterInputs]);

    useEffect(() => {
        if (requestBody.length > 0 && requestBody[0].schema) {
            if (requestBody[0].schema.type === "string") {
                const bodyParameter: Parameter = requestBody[0];
                setBodySchema({ name: bodyParameter.name, type: bodyParameter.schema?.type } as Definition)
            } else {
                const ref: string = requestBody[0].schema.$ref;
                const path: string[] = ref.split('/');
                const defName: string = path[path.length - 1];
                if (defName in data.apiSpec.definitions) {
                    setBodySchema(data.apiSpec.definitions[defName]);
                }
            }
        } else {
            setBodySchema(undefined);
        }
    }, [requestBody, data.apiSpec]);

    useEffect(() => {
        let newPath = path;
        if (data.hub) {
            newPath = newPath.replace('{hub}', data.hub);
        }
        let query: string = "";
        requestParameters.forEach(({ parameter }): void => {
            if (parameter.in === "path") {
                newPath = newPath.replace(`{${parameter.name}}`, requestParameterInputs[parameter.name])
            } else {
                if (requestParameterInputs[parameter.name]) {
                    query += `${parameter.name}=${requestParameterInputs[parameter.name]}&`
                }
            }
        })
        setUrl(`${data.endpoint.slice(0, -1)}${newPath}?${query}api-version=${data.apiSpec.info.version}`);
    }, [path, data.hub, data.endpoint, requestParameterInputs, requestParameters, data.apiSpec]);

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

    async function sendRequest(): Promise<void> {
        const token: string = await dataFetcher.invoke("getRestApiToken", url);
        fetch(url, {
            method: methodName,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: bodyParameterInputs ? JSON.stringify(bodyParameterInputs) : undefined
        }).then(res => {
            const contentType: string | null = res.headers.get("Content-Type");
            if (methodName !== "head" && contentType && (contentType.includes("application/json") || contentType.includes("text/json") || contentType.includes("application/problem+json"))) {
                return res.json();
            } else {
                return res; // super tricky, should improve
            }
        })
            .then(res => {setResponse(res as APIResponse);});
    }

    const tryIt: React.JSX.Element = <div style={{ flex: 3 }}>
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
                <div className="d-flex justify-content-between w-100">
                    <Label>Authorization</Label>
                </div>
                <Input className="d-inline-flex" readOnly={true}
                    contentAfter={<Icon iconName={tokenCopied ? "checkmark" : "copy"} style={{ cursor: "pointer" }}
                        onClick={copyHeaderToken} />}
                    value={token} type={tokenVisible ? "text" : "password"}
                    onClick={() => setTokenVisible(!tokenVisible)} />
                {requestParameters.length > 2 && <div><Label><b>Parameters</b></Label></div>}
                {requestParameters.length > 2 && requestParameters.map(({
                    parameter,
                    inputComponent
                }, index) => (parameter.name !== "api-version" && parameter.name !== "hub" &&
                    <div key={index}>
                        <div className="d-flex">
                            <Label className="me-2">{parameter.name}</Label>
                            {parameter.required && <Label className="text-danger">required</Label>}
                        </div>
                        <div className="d-flex flex-column">
                            {inputComponent}
                            {parameter.description && <small className={"form-text"}>{parameter.description}</small>}
                        </div>
                    </div>
                ))}
                {requestBody && requestBody.length > 0 && <div><Label><b>Body</b></Label>
                    <div className="d-flex">
                        <Label className="me-2">{requestBody[0].name}</Label>{ }
                        {requestBody[0].required && <Label className="text-danger">required</Label>}
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
                        value={bodyParameterInputs}
                        onChange={(value) => {
                            setBodyParameterInputs(value)
                        }}
                    />
                </div>}
                <div className="m-2 d-flex justify-content-end ">
                    <Button icon={<Send24Regular />} onClick={sendRequest}>Invoke</Button>
                </div>
            </CardPreview>
        </Card>
    </div>

    const schema: React.JSX.Element = <div style={{ flex: 1 }}>
        <Card className="m-2 w-95">
            <CardHeader header={<b className="fs-6">Parameter Schema</b>} />
            <CardPreview className="d-flex flex-column align-items-start p-3">
                {<div><Label><b className="fs-6">Query</b></Label>
                    {renderSchema(requestParameters.map(p => p.parameter))}</div>}
                {bodySchema && <div><Label><b className="fs-6">Body</b></Label>
                    {renderBodySchema(bodySchema)}</div>}
            </CardPreview>
        </Card>
    </div>

    return (
        <div className="d-flex">
            {tryIt}
            {schema}
        </div>
    )
}
