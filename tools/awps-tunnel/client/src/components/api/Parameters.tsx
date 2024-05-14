import React, {useEffect, useState} from "react";
import {
	Card,
	CardHeader,
	CardPreview,
	Label, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow
} from "@fluentui/react-components";
import {TextField} from "@fluentui/react";
import {ExampleParameter, Parameter, Definition, APIResponse} from "../../models";
import 'bootstrap/dist/css/bootstrap.min.css';
import restapiSpec from '../api/restapiSample.json'
import JSONInput from "react-json-editor-ajrm/index";
import './Parameters.css'
// @ts-ignore, dependency for library, don't remove
import locale from "react-json-editor-ajrm/locale/en";
import {generateJWT} from '../../utils/jwt';

function renderParameter(parameters: Parameter[], inputTag: React.JSX.Element): React.JSX.Element {
	return (
		<div>{parameters.map((p, key) => {
			return (
				<div key={key}>
					<div className="d-flex">
						<Label className="fs-6 me-2">{p.name}</Label>
						{p.required && <Label className={"red-text"}>required</Label>}
					</div>
					{p.name === "hub" && <TextField value={process.env.REACT_APP_HUB} readOnly={true}/>}
					{p.name !== "hub" && p.name !== "api-version" && inputTag}
					{p.description && <small className={"form-text"}>{p.description}</small>}
				</div>
			)
		})}</div>
	)
}

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
				{parameters.map((p, key) => {
					return (
						<TableRow key={key}>
							<TableCell>
								<div>
									<div>
										{p.name}
									</div>
									{p.required && <div className="red-text">required</div>}
								</div>
							</TableCell>
							<TableCell>{p.type}</TableCell>
						</TableRow>
					)
				})}
			</TableBody>
		</Table>
	</div>)
}

function renderBodySchema(schema: Definition): React.JSX.Element {
	// console.log(schema);
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
	const endpoint: string | undefined = process.env.REACT_APP_ENDPOINT;
	const hub: string | undefined = process.env.REACT_APP_HUB;
	const [queryParameters, setQueryParameters] = useState<{
		parameter: Parameter,
		inputComponent: React.JSX.Element
	}[]>()
	const [pathParameters, setPathParameters] = useState<{
		parameter: Parameter,
		inputComponent: React.JSX.Element
	}[]>()
	const [bodyParameters, setBodyParameters] = useState<Parameter[]>()
	const [copyLabel, setCopyLabel] = useState<string>("copy")
	const [bodySchema, setBodySchema] = useState<Definition>();
	const [url, setUrl] = useState<string>();
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
		parameters.filter(p => p.in === "query").map((p, index) => {
			if (p.name !== "api-version") {
				temp_query_parameter_input[p.name] = ""
			}
		})
		setQueryParameterInputs(temp_query_parameter_input);
		
		let temp_path_parameter_input: { [name: string]: string } = {}
		parameters.filter(p => p.in === "path").map((p) => {
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
		parameters.filter(p => p.in === "query").map((p) => {
			temp_query_parameter.push({
				parameter: p,
				inputComponent: <TextField value={queryParameterInputs[p.name]}
				                           onChange={(e, value) => handleQueryInputOnChange(p.name, value ? value : "")}/>
			});
		})
		setQueryParameters(temp_query_parameter);
		let temp_path_parameter: { parameter: Parameter, inputComponent: React.JSX.Element }[] = [];
		parameters.filter(p => p.in === "path").map((p) => {
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
		if (hub && pathParameterInputs) {
			newPath = newPath.replace('{hub}', hub);
			Object.entries(pathParameterInputs).map(([name, input]) => {
				newPath = newPath.replace(`{${name}}`, input);
			})
		}
		let query: string = ""
		if (queryParameterInputs) {
			Object.entries(queryParameterInputs).map(([name, input]) => {
				if (input !== "") {
					query += `${name}=${input}&`
				}
			})
		}
		setUrl(`${endpoint}${newPath}?${query}api-version=${restapiSpec.info.version}`);
	}, [path, hub, queryParameterInputs, pathParameterInputs]);
	
	
	function copyOnClick(): void {
		setCopyLabel("copied");
		navigator.clipboard.writeText(url || "")
			.then(() => {
				setCopyLabel("copied");
				setTimeout(() => {
					setCopyLabel("copy");
				}, 3000)
			}).catch(err => console.error("Failed to copy: ", err));
	}
	
	async function sendRequest(): Promise<void> {
		const token: string = await generateJWT("user Id: CHANGE ME", `${url}`);
		if (url) {
			fetch(url, {
				method: methodName,
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${token}`
				},
				body: JSON.stringify(bodyParameterInputs)
			}).then(res => {
					const contentType: string | null = res.headers.get("Content-Type");
					if (contentType && (contentType.includes("application/json") || contentType.includes("text/json") || contentType.includes("application/problem+json"))) {
						return res.json();
					} else {
						return res;
					}
				})
				.then(res => setResponse(res as APIResponse));
		}
	}
	
	return (
		<div className="d-flex">
			<div className="flex-3">
				<Card className="w-95 m-2">
					<CardHeader header={<b className="fs-5">Parameters</b>}/>
					<CardPreview className="d-flex flex-column align-items-start p-3">
						<div className="d-flex justify-content-between w-100">
							<Label>HTTP URL</Label>
							<Label onClick={() => copyOnClick()}>{copyLabel}</Label></div>
						<TextField readOnly={true}
						           value={url}/>
						{queryParameters && queryParameters.length > 1 &&
				<div><Label><b className="fs-5">Query</b></Label></div>}
						{queryParameters && queryParameters.length > 1 && queryParameters.map(({
							                                                                       parameter,
							                                                                       inputComponent
						                                                                       }) => (parameter.name !== "api-version" &&
				<div>
					<div className="d-flex">
						<Label className="fs-6 me-2">{parameter.name}</Label>
											{parameter.required && <Label className="red-text">required</Label>}
					</div>
									{inputComponent}
									{parameter.description && <small className={"form-text"}>{parameter.description}</small>}
				</div>
						))}
						{pathParameters && pathParameters.length > 1 &&
				<div><Label><b className="fs-5">Path</b></Label></div>}
						{pathParameters && pathParameters.length > 1 && pathParameters.map(({parameter, inputComponent}) => (
							parameter.name !== "hub" && <div>
				  <div className="d-flex">
					  <Label className="fs-6 me-2">{parameter.name}</Label>
										{parameter.required && <Label className="red-text">required</Label>}
				  </div>
								{inputComponent}
								{parameter.description && <small className={"form-text"}>{parameter.description}</small>}
			  </div>
						))}
						{bodyParameters && bodyParameters.length > 0 && <div><Label><b className="fs-5">Body</b></Label>
							{renderParameter(bodyParameters,
								<JSONInput locale={locale}
								           placeholder={bodyParameterInputs}
								           colors={{
									           default: "black",
									           background: "white",
									           keys: "#8b1853",
									           string: "#4a50a3",
									           colon: "black"
								           }} onChange={(e: any) => setBodyParameterInputs(e.jsObject)} height={"auto"}
								           confirmGood={false}/>)}
			</div>}
						<div className="d-flex justify-content-end w-100">
							<button className={"btn btn-primary w-20"} onClick={sendRequest}>Send</button>
						</div>
					</CardPreview>
				</Card>
			</div>
			<div className="flex-1">
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
		</div>
	
	)
}
