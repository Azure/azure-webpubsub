import React, {useEffect, useState} from "react";
import {
	Card,
	CardHeader,
	CardPreview,
	Label, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow
} from "@fluentui/react-components";
import {TextField} from "@fluentui/react";
import {ExampleParameter, Parameter, Definition} from "../../models";
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
					{p.name === "api-version" && <TextField value={restapiSpec.info.version} readOnly={true}/>}
					{p.name === "hub" && <TextField value={process.env.REACT_APP_HUB} readOnly={true}/>}
					{p.name !== "hub" && p.name !== "api-version" && <TextField/>}
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
	setResponse: React.Dispatch<React.SetStateAction<Response | undefined>>
}): React.JSX.Element {
	const endpoint: string | undefined = process.env.REACT_APP_ENDPOINT;
	const hub: string | undefined = process.env.REACT_APP_HUB;
	const queryParameters: Parameter[] = parameters.filter(p => p.in === "query");
	const headerParameters: Parameter[] = parameters.filter(p => p.in === "header");
	const pathParameters: Parameter[] = parameters.filter(p => p.in === "path");
	const formDataParameters: Parameter[] = parameters.filter(p => p.in === "formData");
	const bodyParameters: Parameter[] = parameters.filter(p => p.in === "body");
	const [copyLabel, setCopyLabel] = useState<string>("copy")
	const [bodySchema, setBodySchema] = useState<Definition>();
	const [url, setUrl] = useState<string>();
	
	useEffect(() => {
		if (bodyParameters.length > 0 && bodyParameters[0].schema) {
			const ref: string = bodyParameters[0].schema.$ref;
			const path: string[] = ref.split('/');
			if (path[path.length - 1] === "AddToGroupsRequest") {
				setBodySchema(restapiSpec.definitions.AddToGroupsRequest);
			}
		}
	}, [bodyParameters]);
	
	useEffect(() => {
		let newPath = path;
		if (hub) {
			newPath = newPath.replace('{hub}', hub);
		}
		setUrl(`${endpoint}${newPath}?api-version=${restapiSpec.info.version}`)
	}, [path, hub]);
	
	
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
	
	async function sendReuqest(): Promise<void> {
		const token: string = await generateJWT("user Id: CHANGE ME", `${url}`);
		if (url) {
			fetch(url, {
				// todo: change "POST" to parameter input later
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${token}`
				},
				body: JSON.stringify(example["groupsToAdd"])
			}).then(res => setResponse(res))
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
						{headerParameters.length > 0 && <div><Label><b style={{fontSize: 20}}>Header</b></Label></div>}
						{queryParameters.length > 0 && <div><Label><b style={{fontSize: 20}}>Query</b></Label>
							{renderParameter(queryParameters, <TextField/>)}</div>}
						{pathParameters.length > 0 && <div><Label><b style={{fontSize: 20}}>Path</b></Label>
							{renderParameter(pathParameters, <TextField value={`hub name`} readOnly={true}/>)}</div>}
						{formDataParameters.length > 0 && <div><Label><b style={{fontSize: 20}}>Form Data</b></Label></div>}
						{bodyParameters.length > 0 && <div><Label><b style={{fontSize: 20}}>Body</b></Label>
							{renderParameter(bodyParameters,
								<JSONInput locale={locale} placeholder={example["groupsToAdd"]}
								           colors={{
									           default: "black",
									           background: "white",
									           keys: "#8b1853",
									           string: "#4a50a3",
									           colon: "black"
								           }} height={"auto"}/>)}
			</div>}
						<div style={{display: "flex", justifyContent: "end", width: "100%"}}>
							<button className={"btn btn-primary"} style={{width: "20%"}} onClick={sendReuqest}>Send</button>
						</div>
					</CardPreview>
				</Card>
			</div>
			<div style={{flex: 1}}>
				<Card style={{margin: 5, width: "95%"}}>
					<CardHeader header={<b style={{fontSize: 15}}>Parameter Schema</b>}/>
					<CardPreview style={{display: "flex", flexDirection: "column", alignItems: "start", padding: 15}}>
						{headerParameters.length > 0 && <div><Label><b style={{fontSize: 15}}>Header</b></Label></div>}
						{queryParameters.length > 0 && <div><Label><b style={{fontSize: 15}}>Query</b></Label>
							{renderSchema(queryParameters)}</div>}
						{pathParameters.length > 0 && <div><Label><b style={{fontSize: 15}}>Path</b></Label>
							{renderSchema(pathParameters)}</div>}
						{formDataParameters.length > 0 && <div><Label><b style={{fontSize: 15}}>Form Data</b></Label></div>}
						{bodySchema && <div><Label><b style={{fontSize: 15}}>Body</b></Label>
							{renderBodySchema(bodySchema)}</div>}
					
					</CardPreview>
				</Card>
			</div>
		</div>
	
	)
}
