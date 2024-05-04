import 'bootstrap/dist/css/bootstrap.min.css';
import './Methods.css'
import React, {useEffect, useState} from "react";
import {APIResponse, Example, Operation} from "../../models";
import {Response} from "./Response";
import {Parameters} from "./Parameters";
import {Label} from "@fluentui/react-components";

export function POST({post, path}: { post: Operation, path: string }): React.JSX.Element {
	const [example, setExample] = useState<Example>();
	const [response, setResponse] = useState<Response | undefined>(undefined);
	useEffect(() => {
		const operationId = post.operationId;
		const exmaplePath = post["x-ms-examples"][operationId].$ref;
		fetch(exmaplePath).then(res => res.json()).then(res => setExample(res))
	}, [post]);
	
	return (
		<div style={{display: "flex"}}>
			<div style={{padding: 15}}>
				<Label style={{fontSize: 25, fontWeight: "bold"}}>{post.summary}</Label>
				
				<div style={{
					display: "flex",
					flexDirection: "row",
					justifyContent: "start",
					alignItems: "center"
				}}>
					<div className={"method-tag"}>POST
					</div>
					<div style={{marginLeft: 10, marginRight: 10}}>{`/hubs/{hub}/:addToGroups`}</div>
				</div>
				
				
				{post.parameters && example &&
			<Parameters path={path} parameters={post.parameters} example={example.parameters} setResponse={setResponse}/>}
				<Response responseSchema={post.responses} response={response}/>
			</div>
		</div>
	)
}
