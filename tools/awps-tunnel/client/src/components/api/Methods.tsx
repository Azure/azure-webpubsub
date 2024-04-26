import 'bootstrap/dist/css/bootstrap.min.css';
import './Methods.css'
import React, {useEffect, useState} from "react";
import {Example, Operation} from "../../models";
import {Response} from "./Response";
import { Parameters} from "./Parameters";
import {Label} from "@fluentui/react-components";

export function POST({post}: { post: Operation }): React.JSX.Element {
	const [example, setExample] = useState<Example>();
	useEffect(() => {
		const operationId = post.operationId;
		const exmaplePath = post["x-ms-examples"][operationId].$ref;
		fetch(exmaplePath).then(res=> res.json()).then(res=>setExample(res))
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
				
				
				{post.parameters && example && <Parameters parameters={post.parameters} example={example.parameters}/>}
				<Response responses={post.responses}/>
			</div>
		</div>
	)
}
