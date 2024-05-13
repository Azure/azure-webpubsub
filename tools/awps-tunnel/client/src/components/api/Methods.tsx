import 'bootstrap/dist/css/bootstrap.min.css';
import './Methods.css'
import React, {useEffect, useState} from "react";
import {Example, Operation, APIResponse} from "../../models";
import {Response} from "./Response";
import {Parameters} from "./Parameters";
import {Label} from "@fluentui/react-components";

export function Method({method, path, methodName}: {
	method: Operation,
	path: string,
	methodName: string
}): React.JSX.Element {
	const [example, setExample] = useState<Example>();
	const [response, setResponse] = useState<APIResponse | undefined>(undefined);
	useEffect(() => {
		const operationId = method.operationId;
		const exmaplePath = method["x-ms-examples"][operationId].$ref;
		fetch(exmaplePath).then(res => res.json()).then(res => setExample(res))
		setResponse(undefined);
	}, [method, path]);
	
	return (
		<div style={{display: "flex"}}>
			<div style={{padding: 15}}>
				<Label style={{fontSize: 25, fontWeight: "bold"}}>{method.summary}</Label>
				
				<div style={{
					display: "flex",
					flexDirection: "row",
					justifyContent: "start",
					alignItems: "center"
				}}>
					<div className={"method-tag"}>{methodName.toUpperCase()}
					</div>
					<div style={{marginLeft: 10, marginRight: 10}}>{path}</div>
				</div>
				
				
				{method.parameters && example &&
			<Parameters path={path} parameters={method.parameters} example={example.parameters}
			            setResponse={setResponse} methodName={methodName}/>}
				<Response responseSchema={method.responses} response={response}/>
			</div>
		</div>
	)
}
