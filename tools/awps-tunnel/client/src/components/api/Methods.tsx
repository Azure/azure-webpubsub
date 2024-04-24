import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import 'bootstrap/dist/css/bootstrap.min.css';
import './Methods.css'
import React, {useState} from "react";
import Collapse from "react-bootstrap/Collapse";
import {Form} from "react-bootstrap";
import {Operation} from "../../models";
import {Response} from "./Response";
import {Parameters, TryItParameters} from "./Parameters";
import {Label} from "@fluentui/react-components";

export function POST({post}: { post: Operation }): React.JSX.Element {
	// console.log(post);
	const [tryCollapse, setTryCollapse] = useState(false);
	
	return (
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
			
			
			{post.parameters && <TryItParameters parameters={post.parameters}/>}
			<Response responses={post.responses}/>
		</div>
	)
}
