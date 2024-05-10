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
// @ts-ignore, dependency for library, don't remove
import locale from "react-json-editor-ajrm/locale/en";
import {generateJWT} from '../../utils/jwt';

function renderParameter(parameters: Parameter[], inputTag: React.JSX.Element): React.JSX.Element {
	return (
		<div>{parameters.map((p, key) => {
			return (
				<div key={key}>
					<div style={{display: "flex"}}>
						<Label style={{fontSize: 18, marginRight: 10}}>{p.name}</Label>
						{p.required && <Label style={{color: "red"}}>required</Label>}
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
		<Table style={{marginBottom: 5}}>
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
									{p.required && <div style={{color: "red"}}>required</div>}
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
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHeaderCell>name</TableHeaderCell>
					<TableHeaderCell>type</TableHeaderCell>
					<TableHeaderCell>items type</TableHeaderCell>
				</TableRow>
			</TableHeader>
			<TableBody>
				{schema.properties && Object.entries(schema.properties).map(([name, item], key) => (
					<TableRow key={key}>
						<TableCell>{name}</TableCell>
						<TableCell>{item.type}</TableCell>
						{item.items && <TableCell>{item.items.type}</TableCell>}
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}

export function Parameters({path, parameters, example, setResponse}: {
	path: string
	parameters: Parameter[],
	example: ExampleParameter,
	setResponse: React.Dispatch<React.SetStateAction<APIResponse | undefined>>
}): React.JSX.Element {
	const endpoint: string | undefined = process.env.REACT_APP_ENDPOINT;
	const hub: string | undefined = process.env.REACT_APP_HUB;
	const [queryParameters, setQueryParameters] = useState<{
		parameter: Parameter,
		inputComponent: React.JSX.Element
	}[]>()
	const [pathParameters, setPathParameters] = useState<Parameter[]>()
	const [bodyParameters, setBodyParameters] = useState<Parameter[]>()
	const [copyLabel, setCopyLabel] = useState<string>("copy")
	const [bodySchema, setBodySchema] = useState<Definition>();
	const [url, setUrl] = useState<string>();
	const [queryParameterInputs, setQueryParameterInputs] = useState<{ [name: string]: string }>({});
	const [pathParameterInputs, setpathParameterInput] = useState<{ [name: string]: string }>({});
	const [bodyParameterInputs, setBodyParameterInputs] = useState<{ groups: string[]; filter: string; } | string>();
	
	// console.log(example);
	
	function handleQueryInputOnChange(name: string, input: string): void {
		setQueryParameterInputs(prevInputs => ({
			...prevInputs,
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
		if (example.groupsToAdd || example.groupsToRemove || example.message) {
			setBodyParameterInputs(example.groupsToAdd || example.groupsToRemove || example.message);
		}
	}, [parameters, example]);
	
	useEffect(() => {
		let temp_query_parameter: { parameter: Parameter, inputComponent: React.JSX.Element }[] = []
		parameters.filter(p => p.in === "query").map((p, index) => {
			temp_query_parameter.push({
				parameter: p,
				inputComponent: <TextField value={queryParameterInputs[p.name]}
				                           onChange={(e, value) => handleQueryInputOnChange(p.name, value ? value : "")}/>
			});
		})
		setQueryParameters(temp_query_parameter);
		setPathParameters(parameters.filter(p => p.in === "path"));
		setBodyParameters(parameters.filter(p => p.in === "body"));
	}, [parameters, queryParameterInputs]);
	
	
	useEffect(() => {
		if (bodyParameters && bodyParameters.length > 0 && bodyParameters[0].schema) {
			const ref: string = bodyParameters[0].schema.$ref;
			const path: string[] = ref.split('/');
			const defName: string = path[path.length - 1];
			if (defName === "AddToGroupsRequest") {
				setBodySchema(restapiSpec.definitions["AddToGroupsRequest"]);
			} else if (defName === "RemoveFromGroupsRequest") {
				setBodySchema(restapiSpec.definitions["RemoveFromGroupsRequest"]);
			}
		} else {
			setBodySchema(undefined);
		}
	}, [bodyParameters]);
	
	useEffect(() => {
		let newPath = path;
		if (hub) {
			newPath = newPath.replace('{hub}', hub);
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
	}, [path, hub, queryParameterInputs]);
	
	
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
		console.log(bodyParameterInputs);
		const token: string = await generateJWT("user Id: CHANGE ME", `${url}`);
		if (url) {
			fetch(url, {
				// todo: change "POST" to parameter input later
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${token}`
				},
				body: JSON.stringify(bodyParameterInputs)
			}).then(res => res.json())
				.then(res => setResponse(res as APIResponse));
		}
	}
	
	return (
		<div style={{display: "flex"}}>
			<div style={{flex: 3}}>
				<Card style={{margin: 5, width: "95%"}}>
					<CardHeader header={<b style={{fontSize: 20}}>Parameters</b>}/>
					<CardPreview style={{display: "flex", flexDirection: "column", alignItems: "start", padding: 15}}>
						<div style={{display: "flex", justifyContent: "space-between", width: "100%"}}>
							<Label>HTTP URL</Label>
							<Label onClick={() => copyOnClick()}>{copyLabel}</Label></div>
						<TextField readOnly={true}
						           value={url}/>
						{queryParameters && queryParameters.length > 1 &&
				<div><Label><b style={{fontSize: 20}}>Query</b></Label></div>}
						{queryParameters && queryParameters.length > 1 && queryParameters.map(({
							                                                                       parameter,
							                                                                       inputComponent
						                                                                       }) => (parameter.name !== "api-version" &&
				<div>
					<div style={{display: "flex"}}>
						<Label style={{fontSize: 18, marginRight: 10}}>{parameter.name}</Label>
											{parameter.required && <Label style={{color: "red"}}>required</Label>}
					</div>
									{inputComponent}
									{parameter.description && <small className={"form-text"}>{parameter.description}</small>}
				</div>
						))}
						{/*{pathParameters && <div><Label><b style={{fontSize: 20}}>Path</b></Label>*/}
						{/*	{renderParameter(pathParameters, <TextField value={`hub name`} readOnly={true}/>)}</div>}*/}
						{/*{pathParameters && pathParameters.map((p) => (*/}
						{/*	<div>*/}
						{/*		<div style={{display: "flex"}}>*/}
						{/*			<Label style={{fontSize: 18, marginRight: 10}}>{p.parameter.name}</Label>*/}
						{/*			{p.parameter.required && <Label style={{color: "red"}}>required</Label>}*/}
						{/*		</div>*/}
						{/*		{p.parameter.name === "hub" && <TextField value={restapiSpec.info.version} readOnly={true}/>}*/}
						{/*		{p.parameter.name !== "hub" && p.inputComponent}*/}
						{/*		{p.parameter.description && <small className={"form-text"}>{p.parameter.description}</small>}*/}
						{/*	</div>*/}
						{/*))}*/}
						{bodyParameters && bodyParameters.length > 0 && <div><Label><b style={{fontSize: 20}}>Body</b></Label>
							{renderParameter(bodyParameters,
								<JSONInput locale={locale}
								           placeholder={bodyParameterInputs}
								           colors={{
									           default: "black",
									           background: "white",
									           keys: "#8b1853",
									           string: "#4a50a3",
									           colon: "black"
								           }} onChange={(e:any) => setBodyParameterInputs(e.jsObject)} height={"auto"} confirmGood={false}/>)}
			</div>}
						<div style={{display: "flex", justifyContent: "end", width: "100%"}}>
							<button className={"btn btn-primary"} style={{width: "20%"}} onClick={sendRequest}>Send</button>
						</div>
					</CardPreview>
				</Card>
			</div>
			<div style={{flex: 1}}>
				<Card style={{margin: 5, width: "95%"}}>
					<CardHeader header={<b style={{fontSize: 15}}>Parameter Schema</b>}/>
					<CardPreview style={{display: "flex", flexDirection: "column", alignItems: "start", padding: 15}}>
						{queryParameters && <div><Label><b style={{fontSize: 15}}>Query</b></Label>
							{renderSchema(queryParameters.map(p => p.parameter))}</div>}
						{pathParameters && <div><Label><b style={{fontSize: 15}}>Path</b></Label>
							{renderSchema(pathParameters)}</div>}
						{bodySchema && <div><Label><b style={{fontSize: 15}}>Body</b></Label>
							{renderBodySchema(bodySchema)}</div>}
					</CardPreview>
				</Card>
			</div>
		</div>
	
	)
}
