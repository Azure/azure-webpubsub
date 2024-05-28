import React, {useEffect, useState} from "react";
import {
	Card,
	CardHeader,
	CardPreview,
	Label,
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableHeaderCell,
	TableRow,
	Input
} from "@fluentui/react-components";
import {Icon} from '@fluentui/react/lib/Icon';
import {TextField} from "@fluentui/react";
import {ExampleParameter, Parameter, Definition, APIResponse} from "../../models";
import 'bootstrap/dist/css/bootstrap.min.css';
import restapiSpec from '../api/restapiSample.json'
import JSONInput from "react-json-editor-ajrm/index";
// @ts-ignore, dependency for library, don't remove
import locale from "react-json-editor-ajrm/locale/en";
import {useDataContext} from "../../providers/DataContext";


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
				{parameters.map((p, key) => (
						<TableRow key={key}>
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
					{schema.properties && Object.entries(schema.properties).map(([name, item], key) => (
						<TableRow key={key}>
							<TableCell>{name}</TableCell>
							<TableCell>{item.type}</TableCell>
							{item.items && <TableCell>{item.items.type}</TableCell>}
						</TableRow>
					))}
				</TableBody>}
		</Table>
	)
}

export function Parameters({path, parameters, example, setResponse, methodName}: {
	path: string
	parameters: Parameter[],
	example: ExampleParameter,
	setResponse: React.Dispatch<React.SetStateAction<APIResponse | undefined>>,
	methodName: string
}): React.JSX.Element {
	const {data, dataFetcher} = useDataContext();
	const [token, setToken] = useState("");
	const [tokenVisible, setTokenVisible] = useState(false);
	const [queryParameters, setQueryParameters] = useState<{
		parameter: Parameter,
		inputComponent: React.JSX.Element
	}[]>()
	const [pathParameters, setPathParameters] = useState<{
		parameter: Parameter,
		inputComponent: React.JSX.Element
	}[]>()
	const [bodyParameters, setBodyParameters] = useState<Parameter[]>()
	// const [copyLabel, setCopyLabel] = useState<string>("copy")
	const [urlCopied, setUrlCopied] = useState<boolean>(false);
	const [tokenCopied, setTokenCopied] = useState<boolean>(false);
	const [bodySchema, setBodySchema] = useState<Definition>();
	const [url, setUrl] = useState<string>("");
	const [queryParameterInputs, setQueryParameterInputs] = useState<{ [name: string]: string }>({});
	const [pathParameterInputs, setpathParameterInputs] = useState<{ [name: string]: string }>({});
	const [bodyParameterInputs, setBodyParameterInputs] = useState<{ groups: string[]; filter: string; } | {
		message: string | undefined
	}>();
	
	function handleQueryInputOnChange(name: string, input: string): void {
		setQueryParameterInputs(prevInputs => ({
			...prevInputs,
			[name]: input
		}));
	}
	
	function handlePathInputOnChange(name: string, input: string): void {
		setpathParameterInputs(precInputs => ({
			...precInputs,
			[name]: input
		}));
	}
	
	useEffect(() => {
		let temp_query_parameter_input: { [name: string]: string } = {}
		parameters.filter(p => p.in === "query").forEach((p, index): void => {
			if (p.name !== "api-version") {
				temp_query_parameter_input[p.name] = ""
			}
		})
		setQueryParameterInputs(temp_query_parameter_input);
		
		let temp_path_parameter_input: { [name: string]: string } = {}
		parameters.filter(p => p.in === "path").forEach((p): void => {
			if (p.name !== "hub") {
				temp_path_parameter_input[p.name] = ""
			}
		})
		setpathParameterInputs(temp_path_parameter_input);
		
		if (example.groupsToAdd || example.groupsToRemove || example.message) {
			setBodyParameterInputs(example.groupsToAdd || example.groupsToRemove || {message: example.message});
		}
	}, [parameters, example]);
	
	useEffect(() => {
		let temp_query_parameter: { parameter: Parameter, inputComponent: React.JSX.Element }[] = [];
		parameters.filter(p => p.in === "query").forEach((p): void => {
			temp_query_parameter.push({
				parameter: p,
				inputComponent: <TextField value={queryParameterInputs[p.name]}
				                           onChange={(e, value) => handleQueryInputOnChange(p.name, value ? value : "")}/>
			});
		})
		setQueryParameters(temp_query_parameter);
		let temp_path_parameter: { parameter: Parameter, inputComponent: React.JSX.Element }[] = [];
		parameters.filter(p => p.in === "path").forEach((p): void => {
			temp_path_parameter.push({
				parameter: p,
				inputComponent: <TextField value={pathParameterInputs[p.name]}
				                           onChange={(e, value) => handlePathInputOnChange(p.name, value ? value : "")}></TextField>
			})
		})
		setPathParameters(temp_path_parameter);
		setBodyParameters(parameters.filter(p => p.in === "body"));
	}, [parameters, queryParameterInputs, pathParameterInputs]);
	
	
	useEffect(() => {
		if (bodyParameters && bodyParameters.length > 0 && bodyParameters[0].schema) {
			if (bodyParameters[0].schema.type === "string") {
				const bodyParameter: Parameter = bodyParameters[0];
				setBodySchema({name: bodyParameter.name, type: bodyParameter.schema?.type} as Definition)
			} else {
				const ref: string = bodyParameters[0].schema.$ref;
				const path: string[] = ref.split('/');
				const defName: string = path[path.length - 1];
				if (defName === "AddToGroupsRequest") {
					setBodySchema(restapiSpec.definitions["AddToGroupsRequest"]);
				} else if (defName === "RemoveFromGroupsRequest") {
					setBodySchema(restapiSpec.definitions["RemoveFromGroupsRequest"]);
				}
			}
		} else {
			setBodySchema(undefined);
		}
	}, [bodyParameters]);
	
	useEffect(() => {
		let newPath = path;
		if (data.hub && pathParameterInputs) {
			newPath = newPath.replace('{hub}', data.hub);
			Object.entries(pathParameterInputs).forEach(([name, input]): void => {
				newPath = newPath.replace(`{${name}}`, input);
			})
		}
		let query: string = ""
		if (queryParameterInputs) {
			Object.entries(queryParameterInputs).forEach(([name, input]): void => {
				if (input !== "") {
					query += `${name}=${input}&`
				}
			})
		}
		setUrl(`${data.endpoint.slice(0, -1)}${newPath}?${query}api-version=${restapiSpec.info.version}`);
	}, [path, data.hub, queryParameterInputs, pathParameterInputs, data.endpoint]);
	
	useEffect(() => {
		async function getToken() {
			const token: string = await dataFetcher.invoke("getRestApiToken", url);
			setToken(token);
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
			body: JSON.stringify(bodyParameterInputs)
		}).then(res => {
				const contentType: string | null = res.headers.get("Content-Type");
				if (methodName !== "head" && contentType && (contentType.includes("application/json") || contentType.includes("text/json") || contentType.includes("application/problem+json"))) {
					return res.json();
				} else {
					return res;
				}
			})
			.then(res => setResponse(res as APIResponse));
	}
	
	const tryIt: React.JSX.Element = <div style={{flex: 3}}>
		<Card className="w-95 m-2">
			<CardHeader header={<b className="fs-6">Try It</b>}/>
			<CardPreview className="d-flex flex-column align-items-start p-3">
				<div className="d-flex justify-content-between w-100">
					<Label>HTTP URL</Label>
				</div>
				<Input className="d-inline-flex" readOnly={true}
				       contentAfter={<Icon iconName={urlCopied ? "checkmark" : "copy"} style={{cursor: "pointer"}}
				                           onClick={copyUrl}/>}
				       value={url}/>
				<div className="d-flex justify-content-between w-100">
					<Label>Preflight Authentication Token</Label>
				</div>
				<Input className="d-inline-flex" readOnly={true}
				       contentAfter={<Icon iconName={tokenCopied ? "checkmark" : "copy"} style={{cursor: "pointer"}}
				                           onClick={copyHeaderToken}/>}
				       value={token} type={tokenVisible ? "text" : "password"}
				       onClick={() => setTokenVisible(!tokenVisible)}/>
				{queryParameters && queryParameters.length > 1 &&
			<div><Label><b>Query</b></Label></div>}
				{queryParameters && queryParameters.length > 1 && queryParameters.map(({
					                                                                       parameter,
					                                                                       inputComponent
				                                                                       }) => (parameter.name !== "api-version" &&
			<div>
				<div className="d-flex">
					<Label className="fs-6 me-2">{parameter.name}</Label>
									{parameter.required && <Label className="text-danger">required</Label>}
				</div>
							{inputComponent}
							{parameter.description && <small className={"form-text"}>{parameter.description}</small>}
			</div>
				))}
				{pathParameters && pathParameters.length > 1 &&
			<div><Label><b>Path</b></Label></div>}
				{pathParameters && pathParameters.length > 1 && pathParameters.map(({parameter, inputComponent}) => (
					parameter.name !== "hub" && <div>
			  <div className="d-flex">
				  <Label className="fs-6 me-2">{parameter.name}</Label>
								{parameter.required && <Label className="text-danger">required</Label>}
			  </div>
						{inputComponent}
						{parameter.description && <small className={"form-text"}>{parameter.description}</small>}
		  </div>
				))}
				{bodyParameters && bodyParameters.length > 0 && <div><Label><b>Body</b></Label>
			<div className="d-flex">
				<Label className="fs-6 me-2">{bodyParameters[0].name}</Label>{}
							{bodyParameters[0].required && <Label className="text-danger">required</Label>}
			</div>
			<JSONInput locale={locale}
			           placeholder={bodyParameterInputs}
			           colors={{
							           default: "black",
							           background: "white",
							           keys: "#8b1853",
							           string: "#4a50a3",
							           colon: "black"
						           }} onChange={(e: any) => setBodyParameterInputs(e.jsObject)} height={"auto"}
			           confirmGood={false}/>
		
		</div>}
				<div className="d-flex justify-content-end w-100">
					<button className={"btn btn-primary w-20 mt-1"} onClick={sendRequest}>{methodName.toUpperCase()}</button>
				</div>
			</CardPreview>
		</Card>
	</div>
	
	const schema: React.JSX.Element = <div style={{flex: 1}}>
		<Card className="m-2 w-95">
			<CardHeader header={<b className="fs-6">Parameter Schema</b>}/>
			<CardPreview className="d-flex flex-column align-items-start p-3">
				{queryParameters && <div><Label><b className="fs-6">Query</b></Label>
					{renderSchema(queryParameters.map(p => p.parameter))}</div>}
				{pathParameters && <div><Label><b className="fs-6">Path</b></Label>
					{renderSchema(pathParameters.map(p => p.parameter))}</div>}
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
